/*
This class contains what is needed to initialize, play, load, and save
an image in the GraFlic format.
To export the GraFlic you have created to a web-ready portable format,
use GraFlicEncoder.js to save as Animated PNG.
------------------------------------------------------------------------------

The MIT License (MIT)

Copyright (c) 2017 Compukaze LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

------------------------------------------------------------------------------

GraFlicEncoder, GraFlicUtil, and pako are needed for save/load
get pako:
https://github.com/nodeca/pako/ (MIT License)



*/
'use strict';
function GraFlicImage(v_fromArchive, v_params){
	if(!v_params){v_params = {};}//avoid having to do more is-defined checks
	
	//fromArchive is either null/undefined/false for blank or a Uint8Array
	//TODO: make it able to load from an archive, probably just call a loader function from here maybe with some binding or extra stuff. 
	
	
	this.penWidth = 2;
	this.penOpacityAnalysis = {};//Pen strokes need to have full opacity at the center of the stroke to work with the fill tool and not leak. Using FULL opacity as the edge is important because images should not have stray bits of slightly transparent pixels randomly in them. That can mess up pixel recycling between APNG frames and force a full clear of the region to update it. This var should NOT be saved in the JSON with the save file. There is a chance that the behavior of wire stroke varies slightly between browsers. This needs to be recalculated on each runtime.
	this.curStroke = [];
	this.curTool = 1;
	//1 = pen
	//2 = fill bucket
	//3 = wire bucket
	//202 = swap channels bucket
	//300 = lasso cutter
	this.curToolState = 0;//tool state
	//0 = inactive
	//100 = drawing
	//200 = finished and/or ready to transfer to custom bitmap channels (wire_index/wire_alpha/fill_index)
	this.curDrawMode = 1;//0 for erase, 1 for draw

	this.undoStack = [];
	this.redoStack = [];
	
	if(v_params.canvasPlayback){
		this.cvM = v_params.canvasPlayback;
	}else{
		this.cvM = document.createElement('canvas');
	}
	this.requestRedraw = this.requestRedrawUnbound.bind(this);
	this.canvasPreviewFrame = v_params.canvasPreviewFrame;//if these are undefined in params, they well be set to undefined.
	this.canvasPreviewBitmap = v_params.canvasPreviewBitmap;
	this.cxM = this.cvM.getContext('2d');
	
	this.cvB = document.createElement('canvas');//each BMP being drawn either as part of the frame or onion skin, which will be drawn onto the main 	canvas after being completed, possibly covering what was drawn on there by a BMP below it
	this.cxB = this.cvB.getContext('2d');
	
	this.cvP = document.createElement('canvas');//preview canvas, draw strokes in progress as a preview for what is being drawn
	this.cxP = this.cvP.getContext('2d');
	//this.cxP.fillStyle = '#00FF00';
	//this.cxP.strokeStyle = '#FF0000';
	//this.cxP.lineWidth = 8;
	
	this.nextTempID = 0;//will be used to assign IDs for objects that are temporary like undo stack or cut bitmaps.
				//(needs to be in place before undo stack initialized)
	
	//Do not override the files if v_fromArchive is set
	//in that case many of these init things will not be needed.
	if(v_fromArchive){
		this.loadFromU8A(new Uint8Array(v_fromArchive));

	}else{//======================== init things only needed if not loaded from existing archive:===================
	//==============================================================================================================
	this.a = new GraFlicArchive(v_fromArchive);//Set up the virtual archive that will handle load/save and be directly manipulatable while live.
	//.a for archive
	var v_initF;
	//Create a folder entry. In ZIP, folders use a trailing slash and have 0 length payload
	//Bitmaps can have lots of files with the compressed channel systems, so stick them in a folder so the root is not cluttered.
	v_initF = {};//omitting data 
	v_initF.p = 'b/';
	this.a.addFile(v_initF);
	
	/*v_initF = {};//Use this to test a UTF-8 folder.
	v_initF.p = '𝕿æßt_Д_ÜTF-8_フォルダ/';
	this.a.addFile(v_initF);*/
	
	//.a.j.save contains the main JSON configurations for the project that will save to the project save file.
	v_initF = {};
	v_initF.p = 'save.json';
	v_initF.j = this.initSaveJSON();
	this.a.addFile(v_initF);
	//JSON data for the metadata of the project(Title, Author, Description, etc).
	v_initF = {};
	v_initF.p = 'meta.json';
	v_initF.j = this.initMetadata();
	this.a.addFile(v_initF);
	this.a.j.save.images = [];
	this.a.j.save.canvas_width = 512;
	this.a.j.save.canvas_height = 512;
	this.a.j.save.index_bit_depth = 8;//May have to raise to 16 if more than 156 palette entries
	this.a.j.save.alpha_bit_depth = 8;//May one day be raisable to 16 for 48 bit color with 16 bit alpha.
			//Raising bit depths would require all the channels for each bitmap to be converted into Uint16Array.
	//== Create blank bitmap canvas to start with ==
	this.curImage = this.initBitmapWAIFU();//bitmap currently being operated on
	this.a.j.save.images.push(this.curImage);
	//Note that this curBMP must be there for changeCanvasSize to init the undo stack.
	//Send the flags for size change AND bitmap pixels, so that it will now to copy the pixels for ALL images. Each image must start with something to undo to when the image is started or restored.
	this.systemChangeCanvasSize(GraFlicImage.UNDO_IMAGE_ALL | GraFlicImage.UNDO_BITMAP_PIXELS, 512, 512);//Make sure the size is initialized to with all the things that need to be set. Make sure trackUndo is set to true so that the initial undo state is created.
	this.a.j.save.save_scale = 0.5;
	//============ set global variables that reset on new image ============
	//colors are drawn by inserting an index to a palette entry, rather than a color code, that way palette colors can be swapped and updated dynamically.
	//palette[0] should always be considered fully transparent
	this.curPalette = this.initPalette();
	this.curPalette.cascade = -9999;//This will be the 'default' palette. All others should cascade over it.
	this.curPalette.default = true;//Non-default palettes may only override some colors and rely on the default to ensure every used index has a color.
	this.a.j.save.palettes = [this.curPalette];//Init palette array.
	this.a.j.save.selected_palette_index = 0;
	this.a.j.save.onion_skin_on = false;
	this.a.j.save.stain_glass_on = false;//Makes fill areas more see-thru so that multiple layers are easier to see.
	
	//----------------------------------------------

	//=========== build default palette ============
	this.newPaletteColorRGBA(0, 0, 0, 0, '❌');//palette[0] should ALWAYS be fully transparent
	this.newPaletteColorRGBA(0, 0, 0, 1, '⚫️');//Default to true black for color [1].
	this.newPaletteColorRGBA(1, 1, 1, 1, '⚪️');//Default to true white for color [2].
	this.newPaletteColorRGBA(1, 0, 0, 1, '❤️');
	this.newPaletteColorRGBA(0, 1, 0, 1, '💚');
	this.newPaletteColorRGBA(0, 0, 1, 1, '💙');
	this.a.j.save.selected_color_index = 1;
	this.curPaletteColor = this.curPalette.colors[this.a.j.save.selected_color_index];
	//----------------------------------------------
	
	this.curFrame = this.initFrame();
	this.a.j.save.frames = [this.curFrame];
	//----------------------------------------------
	//Note that the first undo stack entry will be made on change canvas size where it resets the undos.
	}//================================= end init only needed if not loading from a file ===========================
	//==============================================================================================================
	
	
	//this.wasX;//Used for dragging. (Not currently needed...)
	//this.wasY;
	this.dragStartX;
	this.dragStartY;
	this.isDragging = false;
	this.cutBitmap = null;//For cut-paste functionality. null if nothing pasted.
	//this.cutX = 0;//allows the dragging of the cut section.
	//this.cutY = 0;//(removed, use the x/y properties on the bitmap object now.)
	
	//Now setup playback.
	this.updateCanvasVisuals = this.updateCanvasVisualsUnbound.bind(this);//binding needed for it to handle this keyword correctly.
	window.requestAnimationFrame(this.updateCanvasVisuals);
	this.requestRedraw();


	//hook up events
	//TODO: parameter to turn this off if only playback, not drawing is wanted.
	//PointerEvent inherits from MouseEvent, so everything mouse has pointer has, plus pressure.
	var browserHasPE = (typeof PointerEvent) !== 'undefined';
	this.cvM.addEventListener(browserHasPE ? 'pointerdown' : 'mousedown', this.mDown.bind(this));
	this.cvM.addEventListener(browserHasPE ? 'pointermove' : 'mousemove', this.mMove.bind(this));
	this.cvM.addEventListener(browserHasPE ? 'pointerup' : 'mouseup', this.mUp.bind(this));
	this.cvM.addEventListener('touchstart', this.mDown.bind(this));//Also add these handlers as touch so that it works on mobile.
	this.cvM.addEventListener('touchmove', this.mMove.bind(this));
	this.cvM.addEventListener('touchend', this.mUp.bind(this));
	
	this.bucketFill = this.bucketFillUnbound.bind(this);//Used for bucket fills to make this keyword work.
	this.playNextFrame = this.playNextFrameUnbound.bind(this);
	
	if(GraFlicEncoder){//The class will be defined if GraFlicEncoder.js was in a script element. It may not be needed if only doing playback.
		//GraFlicEncoder functions are needed if doing any saving.
		this.encoder = new GraFlicEncoder({
			"format":"png",
			"quality":0.75,
			"generateBase64":false
		});
		this.onExportFrameAdded = this.onExportFrameAddedUnbound.bind(this);
		this.encoder.onFrameAdded = this.onExportFrameAdded;
		this.onExportEncoded = this.onExportEncodedUnbound.bind(this);
		this.encoder.onEncoded = this.onExportEncoded;
		this.exportBound = this.export.bind(this);
		this.frameDrawingForSave = -1;//-1 for save not initialized yet
		this.imageSaveMode = 1;//1 for normal image, 2 for thumb

		this.fileSelectLoader = this.fileSelectLoaderUnbound.bind(this);
		this.fileSelectLoadedHandler = this.fileSelectLoadedHandlerUnbound.bind(this);
	}
};
GraFlicImage.TOOL_PEN = 1;//Simple single width line that ignores pressure.
GraFlicImage.TOOL_BRUSH = 101;//Variable width pressure-aware line.
GraFlicImage.TOOL_FLOOD_FILL = 200;
GraFlicImage.TOOL_FLOOD_WIRE = 201;
GraFlicImage.TOOL_FLOOD_SWAP = 202;
GraFlicImage.TOOL_CUT_LASSO = 300;
GraFlicImage.TOOL_BOUNDS_CROP = 400;
GraFlicImage.TOOL_BOUNDS_MOVE = 401;
GraFlicImage.TOOL_STATE_STOP = 0;
GraFlicImage.TOOL_STATE_DRAW = 100;
GraFlicImage.TOOL_STATE_DONE = 200;

GraFlicImage.prototype.initSaveJSON = function(){
	var configInit = {};
	//Init the save with required properties. If a save is loaded, what it has saved in the save.json will override this.
	//But this is used to ensure all required vars are populated. In future versions more things may be added that old saves do not have.
	//Some early vars that are very foundational may not be checked here.
	//Generally, if a new property is added later, that property being undefined would default to a default behavior.
	configInit.last_image_id = 0;
	configInit.last_frame_id = 0;
	configInit.last_palette_id = 0;
	configInit.last_color_id = 0;
		//These will increment each time an ID is created. The ID will then be converted into a string and used as an associative ID.
		//This ensures there are no ID collisions. This is better than numeric indexed IDs because it will maintain consistency unlike indexed positions would if the object positions were changed or something were deleted.
		//To get the objects to list or draw in the desired order Array.from([]).sort() can be used sorting by list_order and/or z_index.
		//This is better than using a timestamp because timestamps are very long and can collide if generated at the same time.
	configInit.selected_frame_index = 0;
	configInit.selected_image_index = 0;
	configInit.global_delay = 200;//The delay in milliseconds to use if no frame-specific value supplied.
	configInit.global_delay_denom = 1000;//By default all delays are in milliseconds. This exists to expand to add representations if needed. Animated PNG supports delays with a specific numerator and denominator
	configInit.export = {};//export settings
	configInit.export.quality = 0.75;
	
	//PNG-specific options
	configInit.export.png = {};
	
	
	return configInit;
};
GraFlicImage.prototype.getNextID = function(v_idStr, v_temp){
	//Remember that the IDs must be JSON Strings, not numeric.
	if(v_temp){//Do not increment the ID counter if it is a temp object that will get discarded after run time.
		this.nextTempID++;
		return 'temp_' + this.nextTempID.toString(16);//prefix so it does not collide with savable IDs.
	}else{
		v_idStr = 'last_' + v_idStr + '_id';
		this.a.j.save[v_idStr]++;
		return this.a.j.save[v_idStr].toString();//Use base 10 so that numbers order correctly in folders.
	}
};

GraFlicImage.prototype.initMetadata = function(){
	var v_metadata = {};
	v_metadata.project = {};//This var should contain metadata about the project file being drawn/saved.
				//This is a set of pre-defined keys that set specific project parameters.
	v_metadata.project.filetype = 'graflic';//extension
	v_metadata.project.mimetype = 'image/graflic';
	v_metadata.general = {};//This var should contain metadata that would apply to the result image, not just the project save.
				//Things like Title would apply to the project and the output image.
	v_metadata.locale = {};//Data set in locale can cascade over metadata properties (other than .locale itself obviously).
		//For example create 'de_DE' in .locale and create the chain of properties "locale":{"de_DE":{"general":{"Title":"Deutsch Titel"}}}
		//(underscore(_) is better than dash(-) in this case for javascript access .loacale.de-DE is a not valid property name)
	//Change metadata.text to .general, to make it more consistent with how GraFlicEncoder .metadata works
	//Instead of having .text be just text, it could be any value, if 'typeof' text, it can be inserted as a tEXt or iTXt entry for PNG,
	//If typeof 'object' it could have a structure used to build other types of metadata like pHYs or colorspace entries.
	//If it is an object, then it might look for something like '.meta_type' and if the encoder has a way to handle that, it will
	//insert it in the standard way for the output format, and if not recongnized, it will be ignored.
	return v_metadata;//return the initialized object, useful for making sure required init properties are there for parsed JSON.
};

GraFlicImage.prototype.calcBitmapSizes = function(){
	//TODO: Additional logic will be needed her if supporting 16 bit depth for more palette entries or 48 bit color with 16 bit alpha.
	//use this.a.j.save.index_bit_depth, this.a.j.save.alpha_bit_depth ( / 8 for number of bytes per pixel)
	//NOTE: In some cases if bit depth is increased only some channels will be increased. For example 16 bit depth for more palette indices than 255, but NOT moving to 16 bit alpha to support 48 bit color.
	//TODO: phase these globals out for bitmapBytes, each bitmap should have own adjustable dimensions.
		//The things will full canvas size may use these (preview canvas, draw canvas, but not individual bitmaps)
	this.channelBitmapBytes = this.a.j.save.canvas_width * this.a.j.save.canvas_height;
	this.rgba32BitmapBytes = this.a.j.save.canvas_width * this.a.j.save.canvas_height * 4;//Each custom channel will be on its own array of W*H.
	//A channel for wire color index,
	//A channel for wire color anti-alias alpha
	//A channel for fill color index (a flat color that fills in under shapes and slides under the anti-aliased parts to blend)
	//With each channel on its own array, other channels can be added later if needed.
	//TODO: Supporting channels that can contain extra data that is context-dependent on palette type, like representing the position in the gradient blended between two colors.
};
GraFlicImage.prototype.cropBitmap = function(cropB, cropX, cropY, cropW, cropH){
	//Note: currently only supports custom channel system WAIFU, additional logic would be needed if RGBA bitmaps added.
	//This function crops the bitmap UInt array, it does not move the object (x, y) position. That should be done separately if needed.
	//cropX/Y is the position to start copying from (if negative, copy will be ignored until in range)
	var v_wOld;
	var v_hOld;
	var v_oldPixI = 0;
	var v_newPixI = 0;
	
	var v_canvasWidthOld = cropB.w;
	var v_canvasHeightOld = cropB.h;
	
	var v_oldWireA = this.a.f[cropB.chan_a].d;
	var v_oldWireI = this.a.f[cropB.chan_i].d;
	var v_oldFillI = this.a.f[cropB.chan_f].d;

	cropW = Math.round(cropW);//Initializing the Uint8Array with a non-integer can cause errors and bugs.
	cropH = Math.round(cropH);
	cropX = Math.round(cropX);
	cropY = Math.round(cropY);
	var chanBytesWAIFU = cropW * cropH;//Currently 1 byte per pixel, TODO: may optionally expand to 2 if 16-bit supported later.
	//Log check for error conditions when cropping. Occasionally a crop ends up in bugs and broken behavior.
	console.log('crop done... X ' + cropX + ' Y ' + cropY + ' W ' + cropW + ' H ' + cropH + ' b: ' + chanBytesWAIFU);
	this.a.f[cropB.chan_a].d = new Uint8Array(new ArrayBuffer(chanBytesWAIFU));
	this.a.f[cropB.chan_i].d = new Uint8Array(new ArrayBuffer(chanBytesWAIFU));
	this.a.f[cropB.chan_f].d = new Uint8Array(new ArrayBuffer(chanBytesWAIFU));
	//alert('a');
	for(var v_h = 0;v_h < cropH;v_h++){
		for(var v_w = 0;v_w < cropW;v_w++){
			v_newPixI = v_h * cropW + v_w;
			v_wOld = v_w + cropX;
			v_hOld = v_h + cropY;
			v_oldPixI = v_hOld * v_canvasWidthOld + v_wOld;
			//alert(v_newPixI + ' -- ' + v_oldPixI + ' ' +v_wOld + ', ' + v_hOld +' ... ' + v_canvasWidthOld);return;
			if(v_wOld >= 0 && v_hOld >= 0 && v_wOld < v_canvasWidthOld && v_hOld < v_canvasHeightOld){
				this.a.f[cropB.chan_a].d[v_newPixI] = v_oldWireA[v_oldPixI];
				this.a.f[cropB.chan_i].d[v_newPixI] = v_oldWireI[v_oldPixI];
				this.a.f[cropB.chan_f].d[v_newPixI] = v_oldFillI[v_oldPixI];
			}else{//init to zero anything that is not in the copied region
				this.a.f[cropB.chan_a].d[v_newPixI] = 0;
				this.a.f[cropB.chan_i].d[v_newPixI] = 0;
				this.a.f[cropB.chan_f].d[v_newPixI] = 0;
			}
		}
		//v_oldPixI += this.a.j.save.canvas_widthOld;//old value before this var is changed
		//v_newPixI += cropW;
	}
	
	cropB.w = cropW;//Updated the JSON to match the new dimensions.
	cropB.h = cropH;
};
GraFlicImage.prototype.changeCanvasSize = function(v_csW, v_csH, v_startX, v_startY){
	//The general change canvas size will always track changes in the undo stack
	this.systemChangeCanvasSize(GraFlicImage.UNDO_IMAGE_ALL, v_csW, v_csH, v_startX, v_startY);
};
GraFlicImage.prototype.systemChangeCanvasSize = function(v_csUndoFlags, v_csW, v_csH, v_startX, v_startY){
	//Note: be sure to set v_csUndoFlags to 0 if being used by an undo/redo reconstruction otherwise it will break the undo system.
	//If no undo flags are set (0) it will exclude from undo state. If it is the initial action when creating an image, the flags for change canvas size AND bitmap pixels should be set.
	//alert(v_canvasWidthOld + ' x ' + v_canvasHeightOld);
	this.a.j.save.canvas_width = v_csW;
	this.a.j.save.canvas_height = v_csH;
	this.calcBitmapSizes();//Now that W/H has changed, adjust the byte size per channel
	//cycle thru the bitmaps and adjust them to the new size.
	//var v_minCropX = 0;
	//var v_minCropY = 0;
	//var v_maxCropX = v_csW;
	//var v_maxCropY = v_csH;
	var v_posCropW = 0;
	var v_posCropH = 0;
	if(v_startX !== undefined){//if start x/y are defined, they are integers of where to start cropping from. If negative, it shift pixels right/down instead of crop.
		v_posCropW = v_startX;
	}
	if(v_startY !== undefined){
		v_posCropH = v_startY;
	}
	for(var v_i = 0;v_i < this.a.j.save.images.length;v_i++){
		var v_changeB = this.a.j.save.images[v_i];
		v_changeB.x -= v_posCropW;//position based cropping if x/y was set. (The pixels are still there in the individual image/bitmap, but out of view)
		v_changeB.y -= v_posCropH;
		/*//OLD: The bitmaps all have their own x/y/w/h settings independent of canvas size now (though new ones may be inited at canvas size).
		if(v_changeB.type == 'WAIFU'){//=== only bitmaps need channels adjusted =============================================
			this.cropBitmap(v_changeB, v_posCropW, v_posCropH, v_csW, v_csH)
		}//=================================================== end bitmap ===================================================
		*/
	}
	if(v_csUndoFlags){//Do not want undo/redo processing to duplicate itself in the stack and break everything.
		this.pushUndoStack(v_csUndoFlags);//Make the initial state to undo to before anything is drawn/changed.
	}

	this.cvM.width = this.a.j.save.canvas_width;
	this.cvM.height = this.a.j.save.canvas_height;
	this.cvB.width = this.a.j.save.canvas_width;
	this.cvB.height = this.a.j.save.canvas_height;
	this.cvP.width = this.a.j.save.canvas_width;
	this.cvP.height = this.a.j.save.canvas_height;
	
	//The aspect ratio has changed, so adjust the preview canvases
	//this.canvasPreviewBitmap.width = this.a.j.save.canvas_width;
	var v_miniCX;
	v_miniCX = this.canvasPreviewBitmap.getContext('2d');
	v_miniCX.clearRect(0, 0, this.canvasPreviewBitmap.width, this.canvasPreviewBitmap.height);
	v_miniCX = this.canvasPreviewFrame.getContext('2d');
	v_miniCX.clearRect(0, 0, this.canvasPreviewFrame.width, this.canvasPreviewFrame.height);
};//end change canvas size
GraFlicImage.prototype.initImage = function(v_excludeFromArchive, initX, initY, initW, initH){
	//Initializes the shared properties that different types of image all have (bitmaps, embeds...)
	var initI = {};
	//defaults
	initI.id = this.getNextID('image', v_excludeFromArchive);	
	initI.z_index = 0;
	initI.plays_on_frames = [];//the indices to frames in the animation on which this is played/drawn
	initI.plays_on_all_frames = true;//set this rather than selecting each frame individually. If more frames are added later, it would get messed up and not play on those otherwise...
	initI.ui_hidden = false;//if forced hidden for the sake of displaying/drawing (will still be drawn when building the final Animated PNG)
	initI.title = '🖼';//picture graphic char
	return initI;
};
GraFlicImage.prototype.initBitmapGeneral = function(v_excludeFromArchive, initX, initY, initW, initH){
	//Things that apply to the various types of Bitmaps (WAIFU, RGBA, ...)
	var v_initB = this.initImage(v_excludeFromArchive, initX, initY, initW, initH);
	//Make each bitmap have bounds, so that images that only have a small section drawn on do not consume huge amounts of memory.
	v_initB.x = 0;
	v_initB.y = 0;
	v_initB.w = this.a.j.save.canvas_width;
	v_initB.h = this.a.j.save.canvas_height;
	if(initX){v_initB.x = initX;}//undefined evaluates 0/false which is either the default(x/y) or invalid(w/h)
	if(initY){v_initB.y = initY;}
	if(initW){v_initB.w = initW;}
	if(initH){v_initB.h = initH;}
	return v_initB;
};
GraFlicImage.prototype.initBitmapWAIFU = function(v_excludeFromArchive, initX, initY, initW, initH){
	//Creates a bitmap in the WAIFU (Wire Alpha / Index, Fill, Unallocated) format.
	//W is more distinguishable than L for line in lowercase. l can be confused with number 1 or uppercase i(I).
	//Wire like the Wire-looking effects when in stained glass view with the fills partially transparent for analysis and to guide by surrounding animation frames.
	//Each channels is in a separate array. Wire Alpha, Wire Index, and Fill (indexed, no alpha) are initially allocated.
	//Supporting channels are initially unallocated, but may be added as needed. Currently not implemented yet.
	//Supporting channels would be used for assigning things like gradients or textures to assign to an index.
	//Other types of bitmaps like traditional RGBA could be added later, but WAIFU is the focus for now to handle the cell-based graphics that Animated PNGs are good at.
	var v_initB = this.initBitmapGeneral(v_excludeFromArchive, initX, initY, initW, initH);
	v_initB.type = 'WAIFU';
	//NOTE: These could be switched to Uint8ClampedArray if issues are encountered. So far there have not been problems and Clamped might have extra overhead.
	//Cann be called with (true) to exclude the bitmap from being part of the project archive. This can be used for things like temporary bitmaps used by the undo stack or cutting.
	//TODO: .bitmap_mode could be used to make special mode bitmaps that instead of having pixel channels, maybe contain a user-loaded image, or reference a previous bitmap and recycle all or part of it. Some bitmaps could be defined as library items to be accessed by other bitmap objects, some of which might just be references to library items and instructions on where to draw them. However, for now it will stick to the basic mode. bitmap_mode being undefined should default to the default mode.
	//WAIFU channel system bitmaps have the optional property z_index_w, which is initially undefined. It allow the wire to be on a separate (usually higher) z-index than the fill.
	//This will create the bitmap binary dat files and link them via a string ID so that they are automatically associated
	//when the archive is restored. This is better design than having it directly link to the object,
	//because that would require special handling after it loads.
	//Make an ID for each bitmap because if the order of them gets changed and the ID was based off of the original index, it could have problems.
	//TODO: what if multiple bitmaps are initialized at the exact same millisecond??
	var v_bitmapFolder = 'b/' + v_initB.id + '/';
	var newBitmapByteCount = v_initB.w * v_initB.h;
	var v_chanWI = new Uint8Array(new ArrayBuffer(newBitmapByteCount));
	var v_chanWA = new Uint8Array(new ArrayBuffer(newBitmapByteCount));
	var v_chanFI = new Uint8Array(new ArrayBuffer(newBitmapByteCount));
	/*if(v_excludeFromArchive){
		//For the temporary bitmaps such as undo/cut holders, they will not be part of the virtual archive and will link directly to the data instead of having a string linking to the place in the archive.
		v_initB.chan_a = v_chanWA;
		v_initB.chan_i = v_chanWI;
		v_initB.chan_f = v_chanFI;
	}*/
	//else{
		v_initB.chan_a = v_bitmapFolder + v_initB.id + 'a.dat.gz';//channel Wire Alpha
		v_initB.chan_i = v_bitmapFolder + v_initB.id + 'i.dat.gz';//channel Wire Index
		v_initB.chan_f = v_bitmapFolder + v_initB.id + 'f.dat.gz';//channel Fill Index
		
		var v_bFile;
		v_bFile = {};//The folder based on the ID will hold the bitmap channels.
		v_bFile.p = v_bitmapFolder;
		if(v_excludeFromArchive){v_bFile.temp = true;}
		this.a.addFile(v_bFile);
		
		v_bFile = {};
		v_bFile.p = v_initB.chan_a;
		v_bFile.d = v_chanWA;
		if(v_excludeFromArchive){v_bFile.temp = true;}
		this.a.addFile(v_bFile);
		
		v_bFile = {};
		v_bFile.p = v_initB.chan_i;
		v_bFile.d = v_chanWI;
		if(v_excludeFromArchive){v_bFile.temp = true;}
		this.a.addFile(v_bFile);

		v_bFile = {};
		v_bFile.p = v_initB.chan_f;
		v_bFile.d = v_chanFI;
		if(v_excludeFromArchive){v_bFile.temp = true;}
		this.a.addFile(v_bFile);
	//}
	
	
	
	//Make sure all init to zeroes, some browsers may still not have Uint8Arrays automatically 0...
	v_chanWI.fill(0);
	v_chanWA.fill(0);
	v_chanFI.fill(0);
	
	return v_initB;
};
GraFlicImage.prototype.initEmbed = function(fPath){
	var initE = this.initImage();
	initE.type = 'embed';
	initE.file = fPath;
	return initE;
};

GraFlicImage.prototype.addBitmap = function(){
	this.a.j.save.images.push(this.initBitmapWAIFU());
	this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);//The new bitmap must have a pixel state copy to undo back to.
};
GraFlicImage.prototype.addEmbed = function(p){
	this.a.j.save.images.push(this.initEmbed(p));
	this.requestRedraw();//The embed being added will change the visuals. (not initially blank like bitmaps)
};
GraFlicImage.prototype.addFrame = function(){
	this.a.j.save.frames.push(this.initFrame());
};
GraFlicImage.prototype.initFrame = function(){
	var v_initFrame = {};
	v_initFrame.id = this.getNextID('frame');
	//.delay is undefined for use global (0 might be a delay valid value in some odd scenarios, though would not use it on this)
	//.delay_denom is undefined for global denominator. It is unlikely to be used/implemented, ever but could be used to make custom numer/denom delays on the frame level.
	v_initFrame.title = '🎞';//movie frame graphic char
	return v_initFrame;
};


GraFlicImage.prototype.undoRedoCopy = function(v_undoBMP, v_revert){
	var v_liveWI = this.a.f[v_undoBMP.undo_copied_from.chan_i].d;//pixels live on the screen (link to the live bitmap the undo bitmap was copied from)
	var v_liveWA = this.a.f[v_undoBMP.undo_copied_from.chan_a].d;
	var v_liveFI = this.a.f[v_undoBMP.undo_copied_from.chan_f].d;
	var v_tempWI = this.a.f[v_undoBMP.chan_i].d;//pixels from the undo/redo stack object
	var v_tempWA = this.a.f[v_undoBMP.chan_a].d;
	var v_tempFI = this.a.f[v_undoBMP.chan_f].d;
	var v_copyI;
	var chanBytesWAIFU;
	if(v_revert){//Revert to a previous state.
		chanBytesWAIFU = v_undoBMP.undo_copied_from.w * v_undoBMP.undo_copied_from.h;
		for(v_copyI = 0;v_copyI < chanBytesWAIFU;v_copyI++){
			//copy the state of the bitmap before it was changed.
			v_liveWI[v_copyI] = v_tempWI[v_copyI];
			v_liveWA[v_copyI] = v_tempWA[v_copyI];
			v_liveFI[v_copyI] = v_tempFI[v_copyI];
		}
	}else{//Copy an existing state to add to the stack.
		chanBytesWAIFU = v_undoBMP.w * v_undoBMP.h;
		for(v_copyI = 0;v_copyI < chanBytesWAIFU;v_copyI++){
			//copy the state of the bitmap before it was changed.
			v_tempWI[v_copyI] = v_liveWI[v_copyI];
			v_tempWA[v_copyI] = v_liveWA[v_copyI];
			v_tempFI[v_copyI] = v_liveFI[v_copyI];
		}
	}
};
//These bits can be combined with boolean | if an action applies to multiple. Each flag definition should have exactly one bit set.
GraFlicImage.UNDO_BITMAP_PIXELS = 0x1;//Pixels drawn/erased/changed. (including crop, that changes pixels and the must be copied and added to the stack to have a place to redo to after a stroke is made onto the newly cropped bitmap)
GraFlicImage.UNDO_IMAGE_ALL = 0x2;//An action that can affect all images such as Canvas size changed. This combined with BITMAP_PIXELS will signal that a copy of every bitmap is needed, such as in initializing from restoring a file.
GraFlicImage.UNDO_IMAGE_PROPS = 0x4;//JSON properties for image/ bitmap changed
GraFlicImage.prototype.pushUndoStack = function(undoFlags){
	var undoObj = {}, i, i2, uObj1, iObj1;
	undoObj.flags = undoFlags;
	this.redoStack = [];//Cannot redo on top of a change that was done after undoing.
	//-----------------------------------------------------------------
	/*if( !(undoFlags | GraFlicImage.UNDO_IMAGE_ALL) ){//Targets a specific image.
		//Save the position it was moved to. Since there is no bitmap_copy (pixel copying for a move would waste resources) the bounds must be tracked this way.
		//Should not be needed. Image should simply exist in the array of affected images ifs affected.
		undoObj.targ = this.curImage;//target bitmap
	}*/
	undoObj.cw = this.a.j.save.canvas_width;
	undoObj.ch = this.a.j.save.canvas_height;
	//Some actions (change canvas size with cropping adjustments) may change the position of multiple images, so all coordinates must be tracked.
	undoObj.imageStatesList = [];
	undoObj.imageStatesById = [];
	for(i = 0;i < this.a.j.save.images.length;i++){//Save the properties of the different images at the state in case a change affected multiple images.
		iObj1 = this.a.j.save.images[i];
		uObj1 = {};
		uObj1.up_targ = iObj1;//Link target to undo properties.
		uObj1.x = iObj1.x;
		uObj1.y = iObj1.y;
		uObj1.w = iObj1.w;
		uObj1.h = iObj1.h;
		if( (iObj1 == this.curImage || (undoFlags | GraFlicImage.UNDO_IMAGE_ALL) )
		 && (undoFlags | GraFlicImage.UNDO_BITMAP_PIXELS)
			){
			//If the flag that this affects pixels is set copy pixels. If all images flag set, do this for ALL images. (On initialization/reconstruction from file all images must have a point to be able to undo back to.)
			//TODO: Support other channel systems later? RGBA?
			var v_undoBMP = this.initBitmapWAIFU(true, iObj1.x, iObj1.y, iObj1.w, iObj1.h);
			v_undoBMP.undo_copied_from = iObj1;
			//v_undoBMP.name = Math.random();
			this.undoRedoCopy(v_undoBMP, false);
			uObj1.bitmap_copy = v_undoBMP;
		}
		undoObj.imageStatesList.push(uObj1);
		undoObj.imageStatesById[iObj1.id] = uObj1;
	}
	//-----------------------------------------------------------------
	this.undoStack.push(undoObj);
	if(this.undoStack.length > 50){//Limit stack size to keep resources reasonable.
		//clear the bitmap from the undo stack array and delete it from the archive.
		//TODO: There could be an issue where once the last pixel-changing action falls out of the stack, if there are a bunch of non-changing things like moves it will not be able to find the last pixel state to copy it over. Push the pixel state into the next state in the stack where that image does not have one.
		var sDel = this.undoStack.shift(), delState, delBitmap;
		for(i = 0;i < sDel.imageStatesList.length;i++){
			delBitmap = null;
			delState = sDel.imageStatesList[i];
			if(delState.bitmap_copy){//Remove resources from old pixel state
				delBitmap = delState.bitmap_copy;
				//Find the next state in the list within the stack that has the image that had a pixel bitmap_copy scrapped.
				//Ensure that the bitmap copy is passed on to that image state so that any strokes/pixel changes have a copy to undo back to.
				//(Some undo states omit the bitmap copy because the are simply an x/y coordinate change for example.) 
				uObj1 = this.undoStack[0];
				if(uObj1.imageStatesById[delState.id]){
					if(!uObj1.imageStatesById[delState.id].bitmap_copy){
						//Move the pixel save to the next state instead of deleting it.
						//If the next state in the stack already has a bitmap_copy pixel state, let the delete continue.
						//(This kind of logic should only be needed for undos, not redos. Redos are only created by redoing after an undo.)
						uObj1.imageStatesById[delState.id].bitmap_copy = delBitmap;
						delBitmap = null;
					}
				}
			}
			if(delState.bitmap_deleted){//or remove resources from deleted image that has hit the max stack cutoff.
				delBitmap = delState.bitmap_deleted;//(If a delete-an-image action falls out of the stack, it is simply unreachable ever again.)
			}
			if(delBitmap){
				this.a.deleteFile(delBitmap.chan_a);
				this.a.deleteFile(delBitmap.chan_i);
				this.a.deleteFile(delBitmap.chan_f);
				this.a.deleteFile('b/' + delBitmap.id + '/');
			}
		}
	}
	console.log('undo stack: ' + this.undoStack.length);// + ' n: ' + v_undoBMP.name);
};
GraFlicImage.prototype.clearUndoRedo = function(){//Start over if a new project is started/restored. Undo stats linking to non-existing things will make errors.
	while(this.undoStack.length){this.undoStack.pop();}
	while(this.redoStack.length){this.redoStack.pop();}
};
GraFlicImage.prototype.undo = function(){
	console.log('undo called. stack: ' + this.undoStack.length);
	if(this.undoStack.length < 2){return;}//must have initial state, plus something drawn since then.
	this.redoStack.push(this.undoStack.pop());//put the current state in the redo stack
	var v_undoObj = this.undoStack[this.undoStack.length - 1];//undo it to the state that is now at the top of the stack.
	this.undoRedoExec(v_undoObj, false);
	//redo stack will not get too large because it has to come out of the undo stack, which is already limited.
	console.log('redo stack: ' + this.redoStack.length + ' undid code bits: ' + v_undoObj.flags.toString(2));
};
GraFlicImage.prototype.redo = function(){
	console.log('redo called');
	if(!this.redoStack.length){return;}
	var v_undoObj = this.redoStack.pop();
	this.undoRedoExec(v_undoObj, true);
	this.undoStack.push(v_undoObj);
	console.log('undo stack: ' + this.undoStack.length + ' redid code bits: ' + v_undoObj.flags.toString(2));
};
GraFlicImage.prototype.undoRedoExec = function(v_undoObj, isRedo){
	//if(v_undoObj.flags == GraFlicImage.UNDO_BITMAP_PIXELS){//Pixel changing actions undone (stroke, fill, crop)
	var imageState, targImage, i, uObj1;
	console.log('Undo/Redo Exec code: ' + v_undoObj.flags + ' targImage?: ' + targImage);
	var uX, uY, uW, uH;//These will be set if x/y/w/h have been changed, signaling it to reposition or crop.
	for(i = 0;i < v_undoObj.imageStatesList.length;i++){
		imageState = v_undoObj.imageStatesList[i];
		targImage = imageState.up_targ;
		uX = imageState.x;
		uY = imageState.y;
		uW = imageState.w;
		uH = imageState.h;
		//Ensure the current image has the same bounds as what is being copied onto it so that the pixels will align and not get distorted.
		if(uW != targImage.w || uH != targImage.h){//If crop needed
				this.cropBitmap(targImage, 0, 0, uW, uH);
		}
		if(uX != targImage.x || uY != targImage.y){//If move needed
			targImage.x = uX;
			targImage.y = uY;
		}
		var lastPixelState = null, pixSearch, searchStack = this.undoStack;
		if(imageState.bitmap_copy){
			lastPixelState = imageState.bitmap_copy;
		}else{
			//Find the last state that had pixels copied to ensure that the pixels are as they were when moved.
			if(!isRedo){//Only undo needs to have pixels copied in this way. It messes up redo and puts the pixels there before the would be when it was just moved, not drawn on.
				for(pixSearch = searchStack.length-1;pixSearch >= 0;pixSearch--){
					if(searchStack[pixSearch].flags | GraFlicImage.UNDO_BITMAP_PIXELS){
					 if(searchStack[pixSearch].imageStatesById[imageState.id]){
					  if(searchStack[pixSearch].imageStatesById[imageState.id].bitmap_copy){
						lastPixelState = searchStack[pixSearch].imageStatesById[imageState.id].bitmap_copy;
						break;
					  }
					 }
					}
				}
			}
		}
		if(lastPixelState){//If pixels were found that can be copied from previous state. (some actions like move may not have these, and they may be looked up from the last pixel-containing state if applicable.)
			//console.log('lastPixState chan_i: ' + lastPixelState.chan_i);//If there is an error here, be sure that clearUndoRedo was called to clear previous states after going to a new project, linking to no-longer-existing things will break here.
			this.undoRedoCopy(lastPixelState, true);
		}
	}//end images loop
	if(v_undoObj.cw != this.a.j.save.canvas_width || v_undoObj.ch != this.a.j.save.canvas_height){
		//Be sure it is set to exclude from the undo stack.
		this.systemChangeCanvasSize(0, v_undoObj.cw, v_undoObj.ch, v_undoObj.cxs, v_undoObj.cys);
	}
	/*for(i = 0;i < v_undoObj.imageStates.length;i++){
		uObj1 = v_undoObj.imageStates[i];
		uObj1.up_targ.x = uObj1.x;
		uObj1.up_targ.y = uObj1.y;
	}*/
	/*if(v_undoObj.flags == GraFlicImage.UNDO_IMAGE_PROPS){
		targImage.x = v_undoObj.x;
		targImage.y = v_undoObj.y;
	}
	if(v_undoObj.flags == GraFlicImage.UNDO_IMAGE_ALL){
		this.systemChangeCanvasSize(0, v_undoObj.w, v_undoObj.h, v_undoObj.x, v_undoObj.y);
	}*/
};
GraFlicImage.calcRGBAForBitDepth = function(v_color){//static
	var v_base = ['r', 'g', 'b', 'a'];
	var v_bKey;
	for(var v_i = 0;v_i < v_base.length;v_i++){
		v_bKey = v_base[v_i];
		v_color[v_bKey + '24'] = Math.round(v_color[v_bKey] * 0xFF);//0-255
		v_color[v_bKey + '48'] = Math.round(v_color[v_bKey] * 0xFFFF);//0-65k
	}
	//alert(JSON.stringify(v_color));
}
GraFlicImage.prototype.newPaletteColorRGBA = function(v_palR, v_palG, v_palB, v_palA, v_palTitle){
	this.curPalette.colors.push(this.initPaletteColorRGBA(v_palR, v_palG, v_palB, v_palA, v_palTitle));
};
GraFlicImage.prototype.initPaletteColorRGBA = function(v_palR, v_palG, v_palB, v_palA, v_palTitle){
	var v_palHSL = GraFlicUtil.RGB2HSL(v_palR, v_palG, v_palB);
	var v_palColor = {};
	v_palColor.id = this.getNextID('color');
	//r g b and h s l are 0-1.0 floats, allowing future expansion into 48 bit color potentially.
	v_palColor.r = v_palR;
	v_palColor.g = v_palG;
	v_palColor.b = v_palB;
	v_palColor.a = v_palA;
	v_palColor.h = v_palHSL[0];
	v_palColor.s = v_palHSL[1];
	v_palColor.l = v_palHSL[2];
	GraFlicImage.calcRGBAForBitDepth(v_palColor);
	v_palColor.title = v_palTitle;
	v_palColor.style = 'flat';//Currently only supports flat colors. In the future gradients or textures may be supported.
	return v_palColor;
};
GraFlicImage.prototype.initPalette = function(){
	//There can be multiple alternate palettes for recoloring.
	//They can override colors and cascade over the default palette
	var v_initPal = {};
	v_initPal.id = this.getNextID('palette');
	v_initPal.cascade = 0;
	v_initPal.colors = [];
	return v_initPal;
};
GraFlicImage.getPaletteCSSRGBA = function(v_palEntry){//static
	//var v_palEntry = this.curPalette.colors[v_palIndex];
	return 'rgba(' + v_palEntry.r24 + ', ' + v_palEntry.g24 + ', ' + v_palEntry.b24 + ', ' + v_palEntry.a + ')';
};
GraFlicImage.getPaletteCSSRGB = function(v_palEntry){//static
	//Just RGB rather than RGBA, sometimes the alpha needs to be handled separately.
	//var v_palEntry = this.curPalette.colors[v_palIndex];
	return 'rgb(' + v_palEntry.r24 + ', ' + v_palEntry.g24 + ', ' + v_palEntry.b24 + ')';
};









GraFlicImage.prototype.requestRedrawUnbound = function(x1, y1, x2, y2){
	this.redrawRequested = true;
	if(x1 === undefined){//ALL coordinates should be defined, or NONE of them should.
		this.redrawX1 = 0;//default is to draw the whole area.
		this.redrawY1 = 0;
		this.redrawX2 = this.a.j.save.canvas_width;
		this.redrawY2 = this.a.j.save.canvas_height;
		this.redrawFull = true;//Do not let the partial redraw go into effect if a full redraw has been requested.
	}else if(!this.redrawFull){//If redrawing for a stroke or something, only update the region being changes so that it does not lag.
		this.redrawX1 = Math.max(0, Math.round(x1-10));//default is to draw the whole area.
		this.redrawY1 = Math.max(0, Math.round(y1-10));
		this.redrawX2 = Math.min(this.a.j.save.canvas_width, Math.round(x2+10));
		this.redrawY2 = Math.min(this.a.j.save.canvas_height, Math.round(y2+10));
	}
};
GraFlicImage.prototype.alphaOverColorChannel = function(v_byteA, v_byteB, v_alphaA, v_alphaB){
	//apply a standard alpha compositing technique for the alpha of the 
	//wire channel to composite over the fill channel
	//Apply the over operation to composite byteA OVER byte B
	//This algorithm uses 0.0 - 1.0 for alpha, so be sure to convert it from the 0-255 based palette
	//TODO: may support 16 bit depth in the future if the project has been set to 16-bit channels
	v_alphaA /= 255;
	v_alphaB /= 255;
	return	  ( v_byteA * v_alphaA + v_byteB * v_alphaB * ( 1 - (v_alphaA) ) )
		/ ( v_alphaA + v_alphaB * ( 1 - v_alphaA ) );
};
GraFlicImage.prototype.updateCanvasVisualsUnbound = function(v_cTimestamp){
	//this.curToolState || (Old part of condition)
	//Now make the tool request the redraw specifically so that there is not major lag.
	if((this.redrawRequested) && this.frameDrawingForSave == -1){//Do not draw the current view while save in progress. drawingforSave as -1 is the not-saving value.
		this.redrawRequested = false;//do not waste CPU redrawing until a redraw is requested again.
		this.redrawFull = false;
			//The drawFrame code may request a redraw that sets this back to true, for example if a cut pate is made and committed.
		//If in state 0 inactive, the drawing is not currently changing, so do not lag the processor with draws.
		var v_images2Draw = [];//BMP_obj, opacity pairs (onion skin uses reduced opacity.)
		var v_img2Draw;
		var v_imgAlpha;
		var v_imgDoInsert;
		var v_i2dParams;
		var v_displayFrameIndex = this.a.j.save.selected_frame_index;
		var v_displayFrameID = this.a.j.save.frames[this.a.j.save.selected_frame_index].id;
		var v_fMax = this.a.j.save.frames.length - 1;
		if(this.isPlaying){//if playing a preview of the animation.
			v_displayFrameIndex = this.playingFrame;
			v_displayFrameID = this.a.j.save.frames[v_displayFrameIndex].id;
		}
		for(var v_i = 0;v_i < this.a.j.save.images.length;v_i++){
			v_img2Draw = this.a.j.save.images[v_i];
			v_imgAlpha = 1;
			v_imgDoInsert = false;
			if(v_img2Draw.plays_on_all_frames){v_imgDoInsert = true;}
			for(var v_i2 = 0;v_i2 < v_img2Draw.plays_on_frames.length;v_i2++){
				if(v_img2Draw.plays_on_frames[v_i2] == v_displayFrameID){//Link it to String ID, not index since order could be changed.
					v_imgDoInsert = true;
					//if(this.a.j.save.onion_skin_on){
					//	//Give even the current frame partial alpha, so things behind it can be seen.
					//	v_imgAlpha = 0.90;
					//}
					break;
				}else if(this.a.j.save.onion_skin_on){
					if(    v_img2Draw.plays_on_frames[v_i2] == this.a.j.save.frames[Math.min(v_fMax, this.a.j.save.selected_frame_index + 1)].id
					    || v_img2Draw.plays_on_frames[v_i2] == this.a.j.save.frames[Math.max(0, this.a.j.save.selected_frame_index - 1)].id ){
						v_imgDoInsert = true;
						v_imgAlpha = 0.40;
						break;
					}else if(    v_img2Draw.plays_on_frames[v_i2] == this.a.j.save.frames[Math.min(v_fMax, this.a.j.save.selected_frame_index)].id + 2
						  || v_img2Draw.plays_on_frames[v_i2] == this.a.j.save.frames[Math.max(0, this.a.j.save.selected_frame_index)].id - 2 ){
						v_imgDoInsert = true;
						v_imgAlpha = 0.20;
						break;
					}else if(    v_img2Draw.plays_on_frames[v_i2] == this.a.j.save.frames[Math.min(v_fMax, this.a.j.save.selected_frame_index)].id + 3
						  || v_img2Draw.plays_on_frames[v_i2] == this.a.j.save.frames[Math.max(0, this.a.j.save.selected_frame_index)].id - 3 ){
						v_imgDoInsert = true;
						v_imgAlpha = 0.10;
						break;
					}
				}//end onion skin on
			}
			if(v_imgDoInsert){
				v_i2dParams = {};
				v_i2dParams.image = v_img2Draw;
				v_i2dParams.onionAlpha = v_imgAlpha;
				v_images2Draw.push(v_i2dParams);
			}
		}
		if(this.cutBitmap){
			v_i2dParams = {};
			v_i2dParams.image = this.cutBitmap;
			v_i2dParams.onionAlpha = 1;
			v_images2Draw.push(v_i2dParams);
		}
			//an array of bitmap object, opacity pairs.
			//in some cases bitmaps belonging to a different animation frame will be drawn with reduced opacity for an onion skin effect.
			//The bitmaps will be drawn in the order they appear in the array
			//so do any ordering based on z_index when building the array.
		this.drawFrame(v_images2Draw);
	}
	window.requestAnimationFrame(this.updateCanvasVisuals);
};
/*GraFlic uses the custom channel system WAIFU, rather than the typical RGBA.
Wire Alpha/Index, Fill, Unallocated
A palette is defined and referenced with indices rather than having colors saved directly to the bitmap.
This allows for colors to be changed dynamically at any time without any loss or degradation to what has been drawn. It could also allow for alternate palette styles.
It allows for flood fills to touch against smooth antialiased wires without corruption. Fill and Wires can be switched to other color indices without loss or degradation.
Palette index [0] is reserved for transparent with all values 0.
Palette index [0xFF] (255) will be reserved for a placeholder for swapping indices. (Or 0xFFFF in 16-bit mode)

Wire Alpha and Wire Index represent the opacity and the color in the palette for the stokes drawn.

Fill is an indexed channel with no opacity level that can be used to fill in the gaps between wires.

When a wire pixel is fully erased, wire index should be [0] and wire alpha should be 0. There is no need for an palette index if fully erased, and there is no need for a non-zero alpha level if fully erased.
If one of these values is zero(0) but the other is not it will activate a special mode.

If the Wire Alpha is zero, but the wire index is non-zero, then the pixel will be treated as a special case where wires intersect. There is only one set of wire alpha/index channels per bitmap so if one wire hits another, it will set the pixel to 0 alpha and set the index to a color to activate this mode. This mode will blend the pixel based on other wire pixels around it.

If the Wire Index is set to zero, but the Wire Alpha is non-zero, then the Alpha will instead be used to give the Fill channel an opacity level.
(not implemented yet)

There are initially unallocated supporting channels that may be allocated as needed. This can be used to support things like gradients or textures in the future.
*/
GraFlicImage.prototype.drawFrame = function(v_images2DrawUnordered){
	var v_i;
	var v_i2;
	var v_obj;
	var v_dataP;
	var v_copyI;
	var w;
	var h;
	var canvW = this.a.j.save.canvas_width;
	var rdX1 = this.redrawX1;
	var rdY1 = this.redrawY1;
	var rdX2 = this.redrawX2;
	var rdY2 = this.redrawY2;
	var rdW = rdX2 - rdX1;//2 should always have the higher value
	var rdH = rdY2 - rdY1;
	if(!rdW || !rdH){//0 width or height will make breakage.
		return;
	}
	//console.log('draw update region: ' + rdX1 + ', ' + rdY1 + ' / ' + rdX2 + ', ' + rdY2 + ' W: ' + rdW + ' H: ' + rdH);
	var chanWI, chanWA, chanFI;
	var v_rgbaI;
	var v_images2Draw;
	var v_miniCX;//used to make preview thumbs of whole image and bitmap being edited.
	var v_miniScale = this.canvasPreviewBitmap.width / this.cvM.width;
	//Special logic needed for altering draws for the onion skin. If it is currently saving, all onion skin stuff should be ignored until finished.
	var v_drawOnion;
	var v_drawStainedGlass = false;
	var finalOutput = false;//Guidelines and visual hints should not be drawn if drawing for final output.
	if(this.frameDrawingForSave == -1){
		v_drawOnion = this.a.j.save.onion_skin_on ? true : false;
		v_drawStainedGlass = this.a.j.save.stain_glass_on ? true : false;
	}else{
		finalOutput = true;
	}
	//Order any bitmaps sent in the [BMP_OBJ, opacity, ... ] pairs based on z_index
	//Make a COPY of the images array and sort it properly for draw order.
	var imagesToDrawDetectSplitZs = [];
	//images unordered is wrapped in an object that has the onion alpha level and a '.image' link to the image object
	for(v_i = 0;v_i < v_images2DrawUnordered.length;v_i++){
		var imageD = v_images2DrawUnordered[v_i];
		var splitZ = imageD.image.z_index_w !== undefined;
		v_obj = {};
		v_obj.i = imageD;
		v_obj.z = imageD.image.z_index;
		v_obj.m = splitZ ? 1 : 0;//mode, 0 = normal draw all channels, 1 = draw fill, 2 = draw wire
		imagesToDrawDetectSplitZs.push(v_obj);
		if(splitZ){
			v_obj = {};
			v_obj.i = imageD;
			v_obj.z = imageD.image.z_index_w;
			v_obj.m = 2;//mode 2 = draw wire
			imagesToDrawDetectSplitZs.push(v_obj);
		}
	}
	v_images2Draw = Array.from(imagesToDrawDetectSplitZs).sort(
		function(v_v1, v_v2){
			return v_v1.z - v_v2.z;//-1 for 1st is less, 1 for 1st is more, 0 for equal.
		}
	);
	/*for(v_i = 0;v_i < v_images2Draw.length;v_i++){
		console.log('i2d id: ' + v_images2Draw[v_i].i.image.id);
		console.log('i2d z: ' + v_images2Draw[v_i].z);
		console.log('i2d m: ' + v_images2Draw[v_i].m);
		console.log('------');
	}*/
	
	//Clear ONLY the region that is being redrawn.
	this.cxM.clearRect(rdX1, rdY1, rdW, rdH);
	this.cxP.clearRect(rdX1, rdY1, rdW, rdH);
	//this.cxM.clearRect(0, 0, this.cvM.width, this.cvM.height);
	//this.cxP.clearRect(0, 0, this.cvP.width, this.cvP.height);
	if(
		(
		    this.curTool == GraFlicImage.TOOL_PEN
		 || this.curTool == GraFlicImage.TOOL_BRUSH
		 || (this.curTool == GraFlicImage.TOOL_CUT_LASSO && this.cutBitmap == null)
		)
		
		&& this.curStroke.length ){//---------------------------------
		
		this.cxP.save();
		this.cxP.beginPath();
		this.cxP.lineWidth = this.penWidth;//For some reason .lineWidth is ignored if set before .beginPath()
		this.cxP.strokeStyle = GraFlicImage.getPaletteCSSRGB(this.curPaletteColor);
		this.cxP.fillStyle = this.cxP.strokeStyle;
		if(this.curTool == 300){//Lasso
			if(this.curToolState == 200){
				this.cxP.strokeStyle = 'black';
			}else{
				this.cxP.setLineDash([4, 4]);
				this.cxP.strokeStyle = '#7F7F7F';
			}
		}
		var usePressure = true;
		if(this.curTool == GraFlicImage.TOOL_CUT_LASSO || this.curTool == GraFlicImage.TOOL_PEN){
			usePressure = false;//no pressure needed for lasso or basic pen.
		}
		if(usePressure){
			var lastX = this.curStroke[0];
			var lastY = this.curStroke[1];
			var strokeX, strokeY;
			var pointPScale;
/*

             +--{point 1 pressure scale * base wireWidth}
             |
       <-----+---->
       | (x1, y1) |
       |     .    |
      |      .     |
      |      .     |
     |       .      |
     |       .   <--|------{strokes are not filled with .stroke().
    |        .       |  .fill() fills between the two sides of dynamic width line.}
    |    (x2, y2)    |
    <--------+------->
             |
             +--{point 2 pressure scale * base wireWidth}
*/
			this.cxP.moveTo(this.curStroke[0], this.curStroke[1]);
			var wAngle;
			var sPointX, sPointY;
			var xAxisX, xAxisY, yAxisX, yAxisY;
			var rotX, rotY, arcRotX, arcRotY;
			var firstIter = true;
			for(v_i = 3;v_i < this.curStroke.length;v_i += 3){
				strokeX = this.curStroke[v_i];
				strokeY = this.curStroke[v_i + 1];
				pointPScale = this.curStroke[v_i + 2] / 2;//Shape loops around each side of the stroke points, sticking out half each side. 
					//Will push out half the amount on each side to span the whole amount symmetrically.
				if(firstIter){firstIter = false;}//TODO: some things that only apply to first point.
				wAngle = GraFlicImage.angleBetween(lastX, lastY, strokeX, strokeY);
				//TODO: Must move the point to the side, but have the rotation factored in when moving based on the angle.
				//That way the wire is a shape with lines around the two sides expanding/contracting based on the pen pressure at that point.
				lastX = strokeX;
				lastY = strokeY;
				/*var wAngleDeg = wAngle * (180/Math.PI);
				if(wAngleDeg < 0){
					wAngleDeg = 360 + wAngleDeg;
				}
				console.log(wAngleDeg + 'deg');
				*/
				xAxisX = Math.cos(wAngle);
				xAxisY = Math.sin(wAngle);
				yAxisX = Math.cos(wAngle + (Math.PI/2));
				yAxisY = Math.sin(wAngle + (Math.PI/2));
				sPointX = 0;
				sPointY = pointPScale;
				//Rotate the point at origin 0,0 based on the angle between points with the Y sticking out based on the pressure, then translate it to where the line is at the point in the stroke.
				rotX = strokeX + sPointX * xAxisX + sPointY * yAxisX;
				rotY = strokeY + sPointX * xAxisY + sPointY * yAxisY;
				this.cxP.lineTo(rotX, rotY);
			}
			//wAngle -= 1.570796;//Rotate 90 degrees in radians.
			//xAxisX = Math.cos(wAngle);
			//xAxisY = Math.sin(wAngle);
			//yAxisX = Math.cos(wAngle + (Math.PI/2));
			//yAxisY = Math.sin(wAngle + (Math.PI/2));
			sPointX = pointPScale;//For the arcRot to bend between points at the end before wrapping around, push out X instead of Y.
			sPointY = 0;
			arcRotX = strokeX + sPointX * xAxisX + sPointY * yAxisX;
			arcRotY = strokeY + sPointX * xAxisY + sPointY * yAxisY;
			firstIter = true;
			for(v_i = this.curStroke.length - 3;v_i >= 0;v_i -= 3){
				strokeX = this.curStroke[v_i];
				strokeY = this.curStroke[v_i + 1];
				pointPScale = this.curStroke[v_i + 2] / 2;
					//Will push out half the amount on each side to span the whole amount symmetrically.
				if(firstIter){//The point before was on the other side at same point, and will not make an angle on first iteration.
					wAngle = GraFlicImage.angleBetween(strokeX, strokeY, this.curStroke[v_i - 3], this.curStroke[v_i - 2]);
				}else{
					wAngle = GraFlicImage.angleBetween(lastX, lastY, strokeX, strokeY);
				}
				lastX = strokeX;
				lastY = strokeY;
				xAxisX = Math.cos(wAngle);
				xAxisY = Math.sin(wAngle);
				yAxisX = Math.cos(wAngle + (Math.PI/2));
				yAxisY = Math.sin(wAngle + (Math.PI/2));
				sPointX = 0;
				sPointY = pointPScale;//push out the opposite direction for the other side of the stroke from the center of the stroke pont.
				rotX = strokeX + sPointX * xAxisX + sPointY * yAxisX;
				rotY = strokeY + sPointX * xAxisY + sPointY * yAxisY;
				if(firstIter){//The first time it switches from tracing one side to the other, arcTo instead of lineTo. That way the end of the stroke is rounded and pleasant, not only flat.
					//this.cxP.lineTo(arcRotX, arcRotY);//Simple lineTo tracer to test that points are in the right place.
					this.cxP.arcTo(arcRotX, arcRotY, rotX, rotY, pointPScale);
					firstIter = false;
				}//To arc you must arcTo AND lineTo
				this.cxP.lineTo(rotX, rotY);
			}
			//this.cxP.lineWidth = 1;//Test trace outline of shape-as line.
			//this.cxP.stroke();//Trace tester
			this.cxP.fill();//For actual production use .fill() rather than line debug trace.
			//this.cxP.fillStyle = '#FF0000';//Trace control point for end curve.
			//this.cxP.fillRect(arcRotX-1, arcRotY-1, 2, 2);
		}else{//simple line with no pressure variance.
			this.cxP.moveTo(this.curStroke[0], this.curStroke[1]);
			for(v_i = 3;v_i < this.curStroke.length;v_i+=3){
				this.cxP.lineTo(this.curStroke[v_i], this.curStroke[v_i + 1]);
			}
			this.cxP.stroke();
			if(this.curTool == GraFlicImage.TOOL_CUT_LASSO && this.curToolState == 200){
				//For lasso, If finished and ready to commit, fill it to build the mask.
				this.cxP.fill();
			}
		}
		//Do not .closePath() unless drawing a closed shape to connect start/end of line.
		
		this.cxP.restore();
	}
	var xOffset = this.curImage.x, yOffset = this.curImage.y;//If the bitmap is not located at (0, 0) skip to where it starts.
	var rdcX1, rdcX2, rdcY1, rdcY2, rdcW, rdcH;//locally cropped bounds. (not everything in the bounds affected by the stroke is also in the bounds of the bitmap which may be smaller than the whole canvas.)
	//if(this.curImage.x)
	
	//Only draw within the bounds of the current bitmap. (Bitmaps all have their own size and may be smaller than the entire canvas size.)
	rdcX1 = Math.max(this.curImage.x, rdX1);
	rdcY1 = Math.max(this.curImage.y, rdY1);
	rdcX2 = Math.min(this.curImage.x + this.curImage.w, rdX2);
	rdcY2 = Math.min(this.curImage.y + this.curImage.h, rdY2);
	rdcW = rdcX2 - rdcX1;
	rdcH = rdcY2 - rdcY1;
	
	//Force at least 1x1 width/height so there is not an error. The loop afterwards will simply not encounter anything to process if a width/height is 0.
	v_dataP = this.cxP.getImageData(rdcX1, rdcY1, Math.max(1, rdcW), Math.max(1, rdcH));//0, 0, this.cvP.width, this.cvP.height);
	
	if(this.curToolState == 200){
		//If done with current draw, copy to the custom channel system.
		var v_pixA;
		if(this.curTool == GraFlicImage.TOOL_PEN || this.curTool == GraFlicImage.TOOL_BRUSH){
			v_rgbaI = 0;
			chanWA = this.a.f[this.curImage.chan_a].d;
			chanWI = this.a.f[this.curImage.chan_i].d;
			chanFI = this.a.f[this.curImage.chan_f].d;
			//for(v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
			for(h = rdcY1;h < rdcY2;h++){
			for(w = rdcX1;w < rdcX2;w++){
				v_copyI = (h - yOffset) * this.curImage.w + (w - xOffset);
				v_pixA = v_dataP.data[v_rgbaI + 3];//get alpha transparency
				/*penOA replaced with better flood logic
				if(this.penWidth >= 2 && this.penWidth < 3){
					if(v_pixA >= v_penOA.full_thresh){
						v_pixA = 255;
					}
				}*/
				if(v_pixA){//any non-zero value that evals true.
					if(this.curDrawMode){//if DRAWING, not erasing
						/*if(false){//let the existing wire override untying that intersects it
							if(!this.a.f[this.curImage.chan_i].d[v_copyI]){
								//Any wire already drawn will stay and not be overwritten, this works better
								//for preserving line art and drawing the borders of shade/hilight areas
								//drawn that intersect the line art.
								//TODO: allow this behavior to be overridden if needed.
								chanWI[v_copyI] = this.a.j.save.selected_color_index;
								chanWA[v_copyI] |= v_pixA;
							}
						}else if(true){//the new wire drawing over anything it intersects.
							//Fully transparent should be index [0] and alpha 0.
							//An index set non-zero with alpha of zero triggers special handling.
							//This allows intersecting wires of different colors to blend visually gracefully.
							chanWI[v_copyI] = this.a.j.save.selected_color_index;
							chanWA[v_copyI] = 0;
						}else{
							//If a wire already exists, push the current wire value down to the fill channel
							//and draw over it with the current wire, giving a more natural look to the intersect.
							if(v_pixA == 255){
								chanFI[v_copyI] = chanWI[v_copyI]];
							}
							chanWI[v_copyI] = this.a.j.save.selected_color_index;
							chanWA[v_copyI] |= v_pixA;
						}*/
						if(chanWI[v_copyI] && chanWI[v_copyI] != this.a.j.save.selected_color_index && v_pixA < 255){//wire already there, intersect and are different colors, but the stroke over it is not fully opaque.
							//Fully transparent should be index [0] and alpha 0.
							//An index set non-zero with alpha of zero triggers special handling.
							//This allows intersecting wires of different colors to blend visually gracefully.
							chanWI[v_copyI] = this.a.j.save.selected_color_index;
							chanWA[v_copyI] = 0;
						}else{//otherwise,
							chanWI[v_copyI] = this.a.j.save.selected_color_index;
							chanWA[v_copyI] |= v_pixA;
						}
						//boolean |= so that alpha where wires intersect
						//dos not erase alpha opacity from under it.
					}else{//If ERASING instead of drawing.
						chanWA[v_copyI] &= 255 - v_pixA;
						if(!chanWA[v_copyI]){
							//If fully erased, set to transparent pixel index
							chanWI[v_copyI] = 0;//[0] reserved transparent index
						}
					}
				}
				v_rgbaI += 4;//4 bytes per pixel in the RBBA canvas data
			}}//end w / h loops
			this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);//Save state AFTER stroke committed. An initial push will be made when the file is first started.
			this.requestRedraw(rdX1, rdY2, rdX2, rdY2);//redraw after the stroke has been merged into the channel system.
		}//end pen stroke finished code.
		if(this.curTool == GraFlicImage.TOOL_CUT_LASSO && this.cutBitmap == null){//Committing lasso cut once finished selecting area.
			//For lasso tool, copy anything in the mask to the cut Bitmap.
			console.log('Committing lasso cut, movable cut bitmap created.');
			this.cutBitmap = this.initBitmapWAIFU(true);
			//this.cutX = rdX1;
			//this.cutY = rdY1;
			this.cropBitmap(this.cutBitmap, 0, 0, rdW, rdH);
			this.cutBitmap.x = rdX1;//Remember location is not set by the crop operation.
			this.cutBitmap.y = rdY1;
			//alert('cropped ' + this.cutBitmap.x + ' ' + this.cutBitmap.y + ' ' + this.cutBitmap.w + ' ' + this.cutBitmap.h + ' ');
			//v_rgbaI = 0; 
			var v_copyFromI;
			for(h = rdcY1;h < rdcY2;h++){
			for(w = rdcX1;w < rdcX2;w++){
				//Note that testing the pixels from the redraw-crop section cut out with getImageData
				v_rgbaI = (rdcW * (h - rdcY1) + w - rdcX1) * 4;//4 bytes per pixel in the RGBA canvas data
				v_copyI = (this.cutBitmap.w * (h - rdY1) ) + w - rdX1;//new bitmap was inited with rdX1/rdY1 as (x,y)
				v_copyFromI = (this.curImage.w * (h - yOffset) ) + w - xOffset;
				v_pixA = v_dataP.data[v_rgbaI + 3];
				if(v_pixA){
					this.a.f[this.cutBitmap.chan_a].d[v_copyI] = this.a.f[this.curImage.chan_a].d[v_copyFromI];
					this.a.f[this.cutBitmap.chan_i].d[v_copyI] = this.a.f[this.curImage.chan_i].d[v_copyFromI];
					this.a.f[this.cutBitmap.chan_f].d[v_copyI] = this.a.f[this.curImage.chan_f].d[v_copyFromI];
					this.a.f[this.curImage.chan_a].d[v_copyFromI] = 0;//Now delete the area that was cut out of the source bitmap.
					this.a.f[this.curImage.chan_i].d[v_copyFromI] = 0;
					this.a.f[this.curImage.chan_f].d[v_copyFromI] = 0;
				}
			}}
			this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);//Save the state after the area is sliced out. (It will also be saved on the target bitmap pasted onto.)
			this.requestRedraw();//The cut adds a bitmap for the cut area, so request a redraw.
		}
		this.curToolState = 0;//set to 0 inactive now that finished with this draw
	}
	
	//Now use the palette indices and alpha values in the custom channel system
	//To draw onto the main viewing canvas.
	var curImageInView = false;//will be set to true when current image is drawn. If the current image is not visible, then a warning indicator will be shown on the current image preview.
	
	
	if(this.canvasPreviewBitmap){//if the preview was configured
		//Clear this preview first. There may be multiple draws that needed to handle this preview if there is a split z-index between fill and wire.
		v_miniCX = this.canvasPreviewBitmap.getContext('2d');
		v_miniCX.clearRect(rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
		//TODO: make this only copy the updated region to reduce lag.
	}
	for(var v_bmpI = 0;v_bmpI < v_images2Draw.length;v_bmpI++){//images2Draw objects contain .image with the bitmap and other parameter options
		this.cxB.clearRect(rdX1, rdY1, rdW, rdH);//0, 0, this.cvP.width, this.cvP.height);
		v_rgbaI = 0;//Will start at zero even if a sub region is being drawn, because the sub-region is extracted as an array with getImageData.
		//Object containing image and alpha setting was wrapped in anther object for ordering and handling split z-index
		var imageBeingDrawn = v_images2Draw[v_bmpI].i;
		var v_bmpObj = imageBeingDrawn.image;
		var v_onionAlpha = imageBeingDrawn.onionAlpha;//Alpha, used for onion skinning.
		xOffset = v_bmpObj.x;//If the bitmap is not located at (0, 0) skip to where it starts.
		yOffset = v_bmpObj.y;
		//rdcX1, rdcX2, rdcYq, rdcY2;//locally cropped bounds.
		//Only draw within the bounds of the current bitmap. (Bitmaps all have their own size and may be smaller than the entire canvas size.)
		rdcX1 = Math.max(v_bmpObj.x, rdX1);
		rdcY1 = Math.max(v_bmpObj.y, rdY1);
		rdcX2 = Math.min(v_bmpObj.x + v_bmpObj.w, rdX2);
		rdcY2 = Math.min(v_bmpObj.y + v_bmpObj.h, rdY2);
		rdcW = rdcX2 - rdcX1;
		rdcH = rdcY2 - rdcY1;
		if(v_bmpObj.type == 'WAIFU'){//===================================== bitmap ===========================================================
		var zSplitMode = v_images2Draw[v_bmpI].m;//0 = all channels, 1 = fill, 2 = wire
		var zDrawFill = zSplitMode == 0 || zSplitMode == 1;
		var zDrawWire = zSplitMode == 0 || zSplitMode == 2;
		//console.log('getimagedata ' + rdX1 + ', ' + rdY1 + ', ' + rdW + ', ' + rdH + '...');
		var v_dataB = this.cxB.getImageData(rdcX1, rdcY1, Math.max(1, rdcW), Math.max(1, rdcH));//0, 0, this.cvM.width, this.cvM.height);
			//only get image data for the region being drawn on, to avoid lag.
		//old: for(v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
		chanWA = this.a.f[v_bmpObj.chan_a].d;//seems to lag when looked up by associative on each iteration
		chanWI = this.a.f[v_bmpObj.chan_i].d;
		chanFI = this.a.f[v_bmpObj.chan_f].d;
		//Support drawing only the region that has changed to cut down lag.
		//console.log( (rdX2- rdX1) + ' vs ' + rdW);
		for(h = rdcY1;h < rdcY2;h++){
		for(w = rdcX1;w < rdcX2;w++){
			v_copyI = (h - yOffset) * v_bmpObj.w + (w - xOffset);
			//Draw the fill channel first, any wire channel filled in will
			//draw over/partially draw over the channel based on the alpha level it has
			var v_fillIndex;
			var v_fillPalColor;
			var v_fillDrawnAlpha;//May vary by if stained glass is on.
			if(zDrawFill){
				v_fillIndex = chanFI[v_copyI];
				v_fillPalColor = this.curPalette.colors[v_fillIndex];
				if(v_fillIndex){//if non-zero (index zero is always fully transparent)
					//convert the palette index to RGBA in the canvas
					v_dataB.data[v_rgbaI    ] = v_fillPalColor.r24;
					v_dataB.data[v_rgbaI + 1] = v_fillPalColor.g24;
					v_dataB.data[v_rgbaI + 2] = v_fillPalColor.b24;
					if(v_drawStainedGlass){//v_drawOnion &&   previously was only allowing gem view with onion/ghosting on
						v_fillDrawnAlpha = Math.round(v_fillPalColor.a24 * 0.25);
					}else{
						v_fillDrawnAlpha = v_fillPalColor.a24;
					}
					v_dataB.data[v_rgbaI + 3] = v_fillDrawnAlpha;
				}else{
					v_fillDrawnAlpha = 0;//Nothing was drawn, so make sure this is zero.
				}
			}else{
				//If fill is not being drawn on this z-index, the color behind is default transparent [0].
				v_fillIndex = 0;
				v_fillPalColor = this.curPalette.colors[0];
				v_fillDrawnAlpha = 0;
			}
			
			var v_wireIndex = chanWI[v_copyI];
			var v_wireAlpha = chanWA[v_copyI];
			var v_wirePalColor = this.curPalette.colors[v_wireIndex];
			var zDrawWire4Pix = zDrawWire;
			if(zSplitMode != 0 && !v_wirePalColor.zw){
				zDrawWire4Pix = !zDrawWire4Pix;
			}
			//console.log('LCI ' + v_wireIndex);
			if(zDrawWire4Pix && v_wireIndex){//if non-zero (index zero is always fully transparent)
				//It seems non-rounded float region coordinates were causing undefined errors?
				/*try{
					console.log(v_fillPalColor.a24);
				}catch(er){
					console.log(er + ' i: ' + v_fillIndex + ' at ' + w + ', ' + h)
				}*/
				var v_pixelCurAlpha = v_fillDrawnAlpha;//The alpha after fill is drawn.
				//convert the palette index to RGBA in the canvas
				var v_wirePalAlphaOver = v_wireAlpha;//can stay the same if alpha is 255 in wire palette.
				if(v_wirePalColor.a24 < 255){
					//If the palette entry has a non 255 alpha value, that must be factored into the blending.
					v_wirePalAlphaOver = Math.round(v_wireAlpha * v_wirePalColor.a);
				}
				//if(v_wireIndex == v_fillIndex){
					//If the wire and the fill are the same color they should combine to one contiguous shape.
					//The fill has not alpha and is just a flat fill, so anywhere the wire intersects a fill with the same color,
					//then it should leave it as is.
				//}else{
				//}
				//Get the color of the canvas before line applied to composite over
				var v_underR = v_dataB.data[v_rgbaI    ];
				var v_underG = v_dataB.data[v_rgbaI + 1];
				var v_underB = v_dataB.data[v_rgbaI + 2];
				var v_underA = v_pixelCurAlpha;
					if(!v_wireAlpha){
						//an index set non-zero with alpha of zero is special handling for intersecting wires of different colors.
						var v_corIndex = v_wireIndex;//intersecting wire correction index
						var v_aroundIndex;
						var v_aroundCheckI;
						//Check the wire channel pixels around and find one that is non zero and a different wire color. Blend it with that.
						//  -1 0 2
						//  +-+-+-+
						//-1|*|*|*|
						//  +-+-+-+
						// 0|*|z|*|
						//  +-+-+-+
						// 2|*|*|*|
						//  +-+-+-+
						for(var v_aroundX = -1;v_aroundX < 2;v_aroundX++){
							for(var v_aroundY = -1;v_aroundY < 2;v_aroundY++){
								v_aroundCheckI = v_copyI + this.a.j.save.canvas_width * v_aroundY + v_aroundX;
								v_aroundIndex = chanWI[v_aroundCheckI];
								if( v_aroundIndex &&
								    v_aroundIndex != v_wireIndex &&
								    v_copyI != v_aroundCheckI){
								    //&& chanWA[v_aroundCheckI] > 127 ){
									v_corIndex = v_aroundIndex;
								}
							}
						}
						var v_corPal = this.curPalette.colors[v_corIndex];
						v_underR = v_corPal.r24;
						v_underG = v_corPal.g24;
						v_underB = v_corPal.b24;
						v_underA = v_corPal.a24 | v_pixelCurAlpha;//If fill underneath(v_pixelCurAlpha) has opacity, do not get rid of that.
						v_wirePalAlphaOver = 127;//partial blend over fully opaque whatever is under it according to the correction detect.

						//Composite this partially over the fill that has already been drawn based on opacity levels.
						var interectAlphaOver = 127;
						/*v_underR = this.alphaOverColorChannel(v_corPal.r24, v_underR, interectAlphaOver, v_underA);
						v_underG = this.alphaOverColorChannel(v_corPal.g24, v_underG, interectAlphaOver, v_underA);
						v_underB = this.alphaOverColorChannel(v_corPal.b24, v_underB, interectAlphaOver, v_underA);
						v_underA = v_corPal.a24 | v_pixelCurAlpha;//If fill underneath(v_pixelCurAlpha) has opacity, do not get rid of that.
						*/
						
						//v_underR = 255;v_underG = 0;v_underB = 255;
					}
					v_dataB.data[v_rgbaI    ] = this.alphaOverColorChannel(
								v_wirePalColor.r24, v_underR,
								v_wirePalAlphaOver, v_underA );
					v_dataB.data[v_rgbaI + 1] = this.alphaOverColorChannel(
								v_wirePalColor.g24, v_underG,
								v_wirePalAlphaOver, v_underA );
					v_dataB.data[v_rgbaI + 2] = this.alphaOverColorChannel(
								v_wirePalColor.b24, v_underB,
								v_wirePalAlphaOver, v_underA);
					//v_dataB.data[v_rgbaI + 3] = v_wireAlpha | v_underA;
					v_dataB.data[v_rgbaI + 3] = v_underA | v_wirePalAlphaOver;//v_wirePalColor.a24;
				
				/*v_dataB.data[v_rgbaI + 3] = v_wireAlpha & this.alphaOverColorChannel(
								v_wirePalColor.a24, v_dataB.data[v_rgbaI + 3],
								v_wireAlpha, v_pixelCurAlpha );*/
					//Math.round(v_wirePalColor.a24
					//  * v_wireAlpha / 255);
					//some palette colors may have a translucent alpha.
					//these palette colors need to be alpha blended based on the alpha in the palette color and also accounting for the anti-alias wire_alpha channel
				//----- Test code to find breaks in wire that would cause the fill to leak: -----
				//v_dataB.data[v_rgbaI    ] = 0;
				//v_dataB.data[v_rgbaI + 1] = 0;
				//v_dataB.data[v_rgbaI + 2] = 0;
				//v_dataB.data[v_rgbaI + 3] = v_wireAlpha == 255 ? 255 : 0;
				
				//----------- end anti-leak test code --------------------------
			}
			//this.a.j.save.images[v_bmpI].chan_a[v_copyI] = 0;
			//this.a.j.save.images[v_bmpI].chan_i[v_copyI] = 0;
			//this.a.j.save.images[v_bmpI].chan_f[v_copyI] = 0;
			v_rgbaI += 4;
		}}//end of w and h loops.
		this.cxB.putImageData(v_dataB, rdcX1, rdcY1);
		this.cxM.save();
		this.cxM.globalAlpha = v_onionAlpha;
		if(v_bmpObj == this.cutBitmap){
			//If a bitmap being cut, and dragged around.
			this.cxM.drawImage(this.cvB, 0, 0);//this.cutX, this.cutY);
		}else{
			if(!v_bmpObj.blend){//normal draw blend
				this.cxM.drawImage(this.cvB, rdcX1, rdcY1, rdcW, rdcH, rdcX1, rdcY1, rdcW, rdcH);
			}else{
				//Note: There is an experimental canvas.filter property that might be simpler, but it is not standard.
				/*if(v_bmpObj.blend == 'lum'){
					for(h = rdY1;h < rdY2;h++){
					for(w = rdX1;w < rdX2;w++){
						v_rgbaI = (h * canvW + w) * 4;
						this.cvB
					}}
				}*/
			}
		}
		this.cxM.restore();
			
		}else if(v_bmpObj.type == 'embed'){//===================================== embed ===========================================================
			this.cxM.save();
			this.cxM.globalAlpha = v_onionAlpha;
			this.cxM.drawImage(this.a.f[v_bmpObj.file].i, 0, 0);
			this.cxM.restore();
		}//================================================================================================
		
		if(v_bmpObj == this.curImage && this.canvasPreviewBitmap){//if the preview was configured
			//If this is the current image, use it to make a thumbnail of current image being edited.
			//TODO: make this only copy the updated region to reduce lag.
			v_miniCX.drawImage(this.cvB, rdX1, rdY1, rdW, rdH, rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
			//also draw the preview for things being drawn in real time.
			if(this.curToolState == 100){//preview in progress
				//TODO: make this only copy the updated region to reduce lag.
				v_miniCX.drawImage(this.cvP, rdX1, rdY1, rdW, rdH, rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
			}
			curImageInView = true;
		}
		if(!finalOutput && (v_bmpObj == this.curImage || v_bmpObj == this.cutBitmap)
			&& v_bmpObj.type == 'WAIFU' && (zSplitMode == 0 || zSplitMode == 2) ){
			//If split channels, only draw crop guide once on the topmost (wire)
			this.cxB.save();
			this.cxB.fillStyle = '#7F7F7F';
			this.cxB.globalAlpha = 0.5;
			//Adjust it to redraw the crop indicator only in the updated region.
			var cBoxX = v_bmpObj.x;//rdcX1 - rdX1;
			var cBoxY = v_bmpObj.y;//rdcY1 - rdY1;
			var cBoxW = v_bmpObj.w;//Math.min(rdX2, rdcX2) - rdcX1;
			var cBoxH = v_bmpObj.h;//Math.min(rdY2, rdcY2) - rdcY1;
			//console.log(this.curTool + ' / ' + this.curToolState);
			if(this.curTool == GraFlicImage.TOOL_BOUNDS_CROP && this.curToolState == 100){
				//If currently adjusting the cropping tool, show updates to the crop area.
				cBoxX = Math.min(this.dragStartX, this.dragCurX);
				cBoxY = Math.min(this.dragStartY, this.dragCurY);
				cBoxW = Math.max(this.dragStartX, this.dragCurX) - cBoxX;
				cBoxH = Math.max(this.dragStartY, this.dragCurY) - cBoxY;
			}
			//Show cropped bounds if custom dimensions / coordinates set
			//cxB is cleared for each bitmap/image so it can be recycled here.
			this.cxB.clearRect(rdX1, rdY1, rdW, rdH);
			this.cxB.fillRect(rdX1, rdY1, rdW, rdH);
			this.cxB.clearRect(cBoxX, cBoxY, cBoxW, cBoxH);
			this.cxM.drawImage(this.cvB, rdX1, rdY1, rdW, rdH, rdX1, rdY1, rdW, rdH);
			this.cxB.clearRect(rdX1, rdY1, rdW, rdH);//Clear the rect after it has been drawn, so that left over pixels will not spill into other bitmap draws.
			//this.cxM.fillRect(rdX1, rdY1, cBoxX, Math.min( rdH, this.cvM.height ) );
			//alert(v_bmpObj.x+'+' + v_bmpObj.w + ' = ' + (v_bmpObj.x + v_bmpObj.w));
			/*this.cxM.fillRect(rdX1 + cBoxX + cBoxW, rdY1,
					  Math.min( rdX2, this.cvM.width ) - (rdX1 + cBoxX + cBoxW),
					  Math.min( rdY2, this.cvM.height ) - rdY1);
			this.cxM.fillRect(rdX1 + cBoxX, rdY1, cBoxW, Math.max(0, cBoxY - rdY1) );
			this.cxM.fillRect(rdX1 + cBoxX, rdY1 + cBoxY + cBoxH,
					cBoxW, Math.min( rdY2, this.cvM.height ) - (rdY1 + cBoxY + cBoxH) );
			*/
			this.cxB.restore();
		}
	}//end loop thru bitmaps

	
	//This draws a warning if the current bitmap being edited is not visible. If it is visible, then this draw will be overwritten with the preview of the bitmap being drawn on.
	if(!curImageInView && !this.isPlaying && this.canvasPreviewBitmap){//disable this behavior while playing preview, to avoid ugly flashes
		//The canvas for previewing bitmap must have been set in the params for this to run.
		v_miniCX = this.canvasPreviewBitmap.getContext('2d');
		v_miniCX.clearRect(0, 0, this.cvM.width * v_miniScale, this.cvM.height * v_miniScale);
		v_miniCX.save();
		v_miniCX.fillStyle = 'rgba(255, 0, 0, 0.5)';
		v_miniCX.fillRect(0, 0, this.cvM.width * v_miniScale, this.cvM.height * v_miniScale);
		v_miniCX.restore();
	}


	if(this.curToolState == 100){//100 for in progress currently drawing
		//If still in progress, draw the preview onto the main viewing canvas (it may be erased and updated based on what stroke or thing is currently being drawn)
		if(this.curDrawMode){
			this.cxM.save();
			this.cxM.globalAlpha = this.curPaletteColor.a;//If palette color has non-opaque alpha, make the preview match what will be drawn.
			this.cxM.drawImage(this.cvP, rdX1, rdY1, rdW, rdH, rdX1, rdY1, rdW, rdH);//0, 0);
			this.cxM.restore();
		}else{//Invert the currently being drawn on area for erase preview
			//dataP preview pixels were only extracted within where the affected region overlaps the bound of the current bitmap image. Get the same rect from the main draw canvas and visually update it.
			var v_dataM = this.cxM.getImageData(rdcX1, rdcY1, Math.max(1, rdcW), Math.max(1, rdcH));
					//OLD: this.cxM.getImageData(0, 0, this.cvM.width, this.cvM.height);
			var dataBytesRGBA = v_dataM.data.length * 4;
			for(v_rgbaI = 0;v_rgbaI < dataBytesRGBA;v_rgbaI += 4){
				if(v_dataP.data[v_rgbaI + 3]){//if the preview has pixels drawn
					if(v_dataM.data[v_rgbaI + 3]){//if the buffer being drawn on has pixels drawn
						v_dataM.data[v_rgbaI    ] = Math.max(0, 255 - v_dataM.data[v_rgbaI]);
						v_dataM.data[v_rgbaI + 1] = Math.max(0, 255 - v_dataM.data[v_rgbaI + 1]);
						v_dataM.data[v_rgbaI + 2] = Math.max(0, 255 - v_dataM.data[v_rgbaI + 2]);
						v_dataP.data[v_rgbaI + 3] = 0;
					}else{
						v_dataM.data[v_rgbaI    ] = 127;
						v_dataM.data[v_rgbaI + 1] = 127;
						v_dataM.data[v_rgbaI + 2] = 127;
						v_dataM.data[v_rgbaI + 3] = v_dataP.data[v_rgbaI + 3];
					}
				}
				/*if(v_dataP.data[v_rgbaI]){
					if(v_dataM.data[v_rgbaI]){
						v_dataM.data[v_rgbaI] = Math.min(0, 255 - v_dataP.data[v_rgbaI]);
					}else{
						v_dataM.data[v_rgbaI] = 127;
					}
				}*/
			}
			this.cxM.putImageData(v_dataM, rdcX1, rdcY1);
		}
	}
	//Now draw a smaller version onto the mini preview canvas. This is useful to see what is being drawn in relation to positioning with things around it but outside of the main viewer area.
	if(this.canvasPreviewFrame){//if the mini-preview canvas for the current frame was set up
		v_miniCX = this.canvasPreviewFrame.getContext('2d');
		v_miniCX.clearRect(rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
		//TODO: make this only copy the updated region to reduce lag.
		v_miniCX.drawImage(this.cvM, rdX1, rdY1, rdW, rdH, rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
	}
	//now draw a mini preview of the bitmap layer being edited. That is a good reminder of what layer user is editing so they do not draw on the wrong one!
};


GraFlicImage.prototype.togglePlay = function(v_play){
	if(v_play === undefined){//can specifically set true, or false, otherwise it will toggle.
		this.isPlaying = !this.isPlaying;
	}else{
		this.isPlaying = v_play;
	}
	if(this.isPlaying){
		this.playingFrame = -1;//It is incremented at the start of func, so it will always increment to at least 0.
		this.playNextFrame();
	}else{
		this.requestRedraw();//draw it on whatever the current frame is now that it is no longer playing a preview.
	}
}
GraFlicImage.angleBetween = function(v_angleRotX1, v_angleRotY1, v_angleRotX2, v_angleRotY2){
	var v_angleDeltaX;
	var v_angleDeltaY;
				//if(false&&v_angleRotX1 >= v_angleRotX2){
				//	v_angleDeltaX = v_angleRotX1 - v_angleRotX2;
				//}else{
	v_angleDeltaX = v_angleRotX2 - v_angleRotX1;
				//if(false&&v_angleRotY1 >= v_angleRotY2){
				//	v_angleDeltaY = v_angleRotY1 - v_angleRotY2;
				//}else{
	v_angleDeltaY = v_angleRotY2 - v_angleRotY1;
	var v_angleAngle = Math.atan2(v_angleDeltaY, v_angleDeltaX);
	//var v_angleAngle = Math.atan(v_angleDeltaY / v_angleDeltaX);
	return v_angleAngle;
};
GraFlicImage.prototype.playNextFrameUnbound = function(){
	if(!this.isPlaying){return;}
	this.playingFrame++;
	if(this.playingFrame >= this.a.j.save.frames.length){this.playingFrame = 0;}
	//Note that 0 is valid for setTimeout. Some frames could have delay of 0 to draw one regional area at the same time as updating a separate regional area and skip the spaces between.
	setTimeout(this.playNextFrame, this.a.j.save.frames[this.playingFrame].delay === undefined ? this.a.j.save.global_delay : this.a.j.save.frames[this.playingFrame].delay);
	this.requestRedraw();
};

GraFlicImage.prototype.bucketFillUnbound = function(v_x, v_y){//alert('fillcall');
	var alphaMax = 0;//alphaMax and alphaRep always start out 0
	var alphaRep = 0;
	var followUp = false;//If the initial fill click has already been made, and this is a chunked call to do part of the progress with a delay so that it does not lag and lock up for the users while it finishes.
	if(v_x === undefined){//If a follow up call to refresh the call stack after the first click started it.
		followUp = true;
	}else{//If the initial call with the x,y coordinates of the clicked point defined.
		this.floodStopped = false;//The user may stop the flood, if it gets out of control in undesired area and is taking a long time.
	}
	if(this.floodStopped){//Exit lengthy flood operation the user cancelled.
		this.curToolState = GraFlicImage.TOOL_STATE_STOP;
		this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);
		return;
	}
	
	var chunkPix = 0;//When so many pixels have been processed, it will exit and proceed after a delay, to avoid lag/lock-up.
	this.curToolState = 100;//Set it to being drawn state so that the visuals get updated.
	//Bucket fills run very slow with associative array key lookups all the time so save a direct link to the current bitmap.
	this.bucketWA = this.a.f[this.curImage.chan_a].d;
	this.bucketWI = this.a.f[this.curImage.chan_i].d;
	this.bucketFI = this.a.f[this.curImage.chan_f].d;
	//Doing this as recursive is cripplingly slow and requires all kinds of workarounds due to call stack limits of JS
	//So this simulates recursive-style logic while not being actually recursive.
	//Make the call parameters for the first pixel where the flood starts. It will simulate recursive logic without being recursive and running into call stack limits by pushing the next 'calls' into an array that holds the parameters of the simulated calls.
	var v_color2Replace;
	var v_maxX = this.curImage.w;//max x
	var v_maxY = this.curImage.h;//max y
	var v_pixI;
	var v_colorToUse;
	
	var nextPix, np;
	if(followUp){
		nextPix = this.floodPix;//Accessing with .varName seems to maybe slow it down some??
		v_colorToUse = this.floodColor;
		v_color2Replace = this.floodTarget;
	}else{//If initial call, make the first pixel in the array so that the loop will process.
		v_x = Math.round(v_x - this.curImage.x);//Pixel indices are on a round numbers only.
		v_y = Math.round(v_y - this.curImage.y);//be sure to factor in that the bitmap may be smaller than the canvas and offset by an x/y
		v_pixI = (v_maxX * v_y + v_x);
		np = {};
		np.x = v_x;
		np.y = v_y;
		np.m = 0;//Alpha Max
		np.r = 0;//Alpha Repeat
		nextPix = [np];
		v_colorToUse = this.curDrawMode ? this.a.j.save.selected_color_index : 0;//color to fill with
		if(this.curTool == GraFlicImage.TOOL_FLOOD_FILL){//fill bucket
			v_color2Replace = this.bucketFI[v_pixI];
		}else if(this.curTool == GraFlicImage.TOOL_FLOOD_WIRE){//wire bucket
			v_color2Replace = this.bucketWI[v_pixI];
			if(v_color2Replace == 0 && !this.curDrawMode){
				return;//Any wire pixel set to [0] transparent is ERASED already, and this should exit. Most likely the user click missed the wire.
				//However in some cases, the user may want to wire-channel fill in between wires to make a thick stylized wire.
			}
		}else if(this.curTool == GraFlicImage.TOOL_FLOOD_SWAP){//swap bucket
			v_color2Replace = this.bucketFI[v_pixI];
			v_colorToUse = -1;//color to use does not apply to swap, -1 so it does not exit.
			if(v_color2Replace == 0){
				return;//Must have a color in the fill that is being converted to line.
			}
			/*if(this.bucketWI[v_pixI]){
				//Wire is visually on top of fill so it will get hit if both channels
			}else{
				
			}*/
		}
		if(v_color2Replace == v_colorToUse){//Trying to color the same color as itself, makes no sense, and will crash.
			return;
		}
	}
	var alphaRepMax = 16;//The number of times a pixel of the same opacity can be encountered in a row, before it stops the flood due to no increasing opacity.
	//TODO: Should flood behavior be adjustable?: ✢ normal adjacent flood  ❊ diagonal included flood
	var exitPix;
	var chunkExit = false;//Will be set to true if exiting to to max chunk processing.
	//alphaMax tracks the maximum wire alpha encountered for fill floods.
	//alphaRep tracks how many times the same alpha has been repeated.
	//If the alpha encountered is lower than the alphaMax, then it has passed the center of the line where it is darkest and should exit. If the same alpha is repeatedly encountered.
	//The rules of alphaMax/alphaRep apply to Fill floods, NOT wire floods.
	while(nextPix.length){
	exitPix = false;//Set this true to 'return' from the pixel since return would end the whole function.
	np = nextPix.shift();
	v_x = np.x;
	v_y = np.y;
	//console.log(v_x + ', ' + v_y);
	if(v_x < 0 || v_y < 0 || v_x >= v_maxX || v_y >= v_maxY){//If out of bitmap bounds
		//console.log('out of bounds');
		//out of bounds, do not process
	}else{//if in bitmap bounds
	alphaMax = np.m;
	alphaRep = np.r;
	//this.antiBucketOverload++;
	v_pixI = (v_maxX * v_y + v_x);
		//OLD: * 4;//get the corresponding pixel in RGBA array.
	if(this.curTool == GraFlicImage.TOOL_FLOOD_FILL){//====================== FILL Bucket ==================
	//ANYTHING under 255 should be filled under. Otherwise it leaves ugly transparent holes
	//that can mess up the Animated PNG compression with unneeded frame region update due to changing trans pixels
	//The wire alpha being zero, and the index being non-zero(anything other than reserved [0] fully transparent)
	//will be considered opaque for the purpose of containing fills within wires. This triggers special handling for wires intersecting off different colors to correct their blending and appearance. That case should be blocked from considered transparent with && !(...)
	if(this.bucketWA[v_pixI] < alphaMax){// * 0.85){//<--this threshold adjusting does not seem to be effective. Dropping this and adding diagonal recursions seems to have made reliable fills for tight corners. The alpha repeat counter may or may not be helping and could possilbly be removed...
		exitPix = true;//If the alpha goes down from what has been encountered before, the center of the line has been reached and it should not bleed past the edge.
	}
	if(this.bucketWA[v_pixI] <= alphaMax){
		alphaRep++;//AlphaRep will count anything at or below alpha max. Being only slightly below alphaMax does not exit because there are situations where tight corners need to be filled and a strict cutoff would stop too soon.
		if(alphaRep >= alphaRepMax && alphaMax){// && this.bucketWA[v_pixI] >= 192){
			//It may have hit a place where two ends of the line are loosely connected with alpha transparent pixels. Do not let it wrap all around the line on the outside.
			//However, DO NOT, exit if the alphaMax is still 0 and no wires have been encountered. 
			exitPix = true;
		}
	}else{
		alphaRep = 1;
	}
	var nObj;//Used for nextPixels		
	alphaMax = Math.max(alphaMax, this.bucketWA[v_pixI]);
	if(!exitPix && (this.bucketWA[v_pixI] < 255 && !(!this.bucketWA[v_pixI] && this.bucketWI[v_pixI]) )
	 && this.bucketFI[v_pixI] == v_color2Replace
		){
		this.bucketFI[v_pixI] = v_colorToUse;
		if(this.bucketWA[v_pixI] < 255){
			//The alpha threshold to keep expanding the fill, is more tight
			//than the alpha threshold to just fill the current pixel and exit.
			nextPix.push({"x":(v_x + 1), "y":v_y, "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":v_y, "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":v_x, "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":v_x, "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			//Diagonals:
			nextPix.push({"x":(v_x + 1), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x + 1), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			
			//Extended reach not currently seeming to be beneficial...
			//Extended reach:
			/*
			nextPix.push({"x":(v_x + 2), "y":v_y, "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 2), "y":v_y, "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":v_x, "y":(v_y + 2), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":v_x, "y":(v_y - 2), "m":alphaMax, "r":alphaRep});
			*/
			/*
			//Extended reach Diagonals:
			nextPix.push({"x":(v_x + 2), "y":(v_y + 2), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 2), "y":(v_y - 2), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 2), "y":(v_y + 2), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x + 2), "y":(v_y - 2), "m":alphaMax, "r":alphaRep});
			*/
			/*
			//Extended reach Diagonals, revised style:
			nextPix.push({"x":(v_x + 2), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 2), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 2), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x + 2), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x + 1), "y":(v_y + 2), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":(v_y - 2), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":(v_y + 2), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x + 1), "y":(v_y - 2), "m":alphaMax, "r":alphaRep});*/
/*
* = current pixel
o = contiguous check
O = contiguous check extended reach
x = diagonal check
X = diagonal check extended reach
Z = diagonal check extended reach, revised style
X|Z|O|Z|X
-+-+-+-+-
Z|x|o|x|Z
-+-+-+-+-
O|o|*|o|O
-+-+-+-+-
Z|x|o|x|Z
-+-+-+-+-
X|Z|O|Z|X
*/
			//Do diagonal corners. Some tight spots around sharp points are having trouble getting filled.
			//Diagonals could cause leaks with 1x1 lines, but since things are anti-aliased, that should not happen unless the line is extremely thin in which case it is probably just a textural thing, not a boundary for containing fills.
			//Diagonals are not helping it seems...
			/*this.fillRecur(v_x + 1, v_y + 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace, alphaMax, alphaRep);
			this.fillRecur(v_x - 1, v_y - 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace, alphaMax, alphaRep);
			this.fillRecur(v_x - 1, v_y + 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace, alphaMax, alphaRep);
			this.fillRecur(v_x + 1, v_y - 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace, alphaMax, alphaRep);*/
		}
	}
	}else if(this.curTool == GraFlicImage.TOOL_FLOOD_WIRE){//====================== WIRE Bucket ===================
		if(v_color2Replace){
			if(this.bucketWI[v_pixI] == v_color2Replace){
				// && this.a.f[this.curImage.chan_a].d[v_pixI]){
				//deleted wire pixels should always be set to reserved transparent [0]
				//that way wires in wire intersect correction mode can be processed here (0 alpha, index non-zero)
				//Filling a wire with reserved [0] transparent will totally erase it.
				//If wanting to fill with transparent wire that can be recolored/replaced, make an extra palette entry with 0 alpha.
				if(this.curDrawMode){
					this.bucketWI[v_pixI] = v_colorToUse;
				}else{
					this.bucketWI[v_pixI] = 0;
					this.bucketWA[v_pixI] = 0;
				}
				//This style of simply changing the color index of contiguous wire fill pixels
				//does not seem to struggle completing thoroughly and probably does not need diagonals.
				nextPix.push({"x":(v_x + 1), "y":v_y, "m":alphaMax, "r":alphaRep});
				nextPix.push({"x":(v_x - 1), "y":v_y, "m":alphaMax, "r":alphaRep});
				nextPix.push({"x":v_x, "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
				nextPix.push({"x":v_x, "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			}
		}else{//End replacing non-transparent
			//Wire can fill in fully transparent areas with wire channel fill if both wire and fill are transparent where the flood is clicked.
			if(this.bucketFI[v_pixI] == v_color2Replace){
					//Currently will always be replacing [0] in this mode.

				//see alpha max/rep comments in fill flood section, this is modeled after that.
				if(this.bucketWA[v_pixI] == 255 || this.bucketWA[v_pixI] < alphaMax){
					//obviously exit if wire is fully opaque already.
					exitPix = true;
				}
				if(alphaMax && this.bucketWA[v_pixI] <= alphaMax){
					//For wire fill over fully transparent sections it can do unlimited repeats as long as wire alpha stays at 0, so do not increment alphaRep in that case.
					alphaRep++;
					if(alphaRep >= alphaRepMax && alphaMax){
						exitPix = true;
					}
				}else{
					alphaRep = 1;
				}
				alphaMax = Math.max(alphaMax, this.bucketWA[v_pixI]);
				if(!exitPix){
					this.bucketWI[v_pixI] = v_colorToUse;
					this.bucketWA[v_pixI] = 255;
					nextPix.push({"x":(v_x + 1), "y":v_y, "m":alphaMax, "r":alphaRep});
					nextPix.push({"x":(v_x - 1), "y":v_y, "m":alphaMax, "r":alphaRep});
					nextPix.push({"x":v_x, "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
					nextPix.push({"x":v_x, "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
					//Diagonals:
					nextPix.push({"x":(v_x + 1), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
					nextPix.push({"x":(v_x - 1), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
					nextPix.push({"x":(v_x - 1), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
					nextPix.push({"x":(v_x + 1), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
				}
			}
		}//End replacing transparent [0]
	}else if(this.curTool == GraFlicImage.TOOL_FLOOD_SWAP){//====================== SWAP Bucket ===================
		if(this.bucketFI[v_pixI] == v_color2Replace){
			this.bucketWA[v_pixI] = 255;
			this.bucketWI[v_pixI] = v_color2Replace;
			this.bucketFI[v_pixI] = 0;
			nextPix.push({"x":(v_x + 1), "y":v_y, "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":v_y, "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":v_x, "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":v_x, "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			//Diagonals:
			nextPix.push({"x":(v_x + 1), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x - 1), "y":(v_y + 1), "m":alphaMax, "r":alphaRep});
			nextPix.push({"x":(v_x + 1), "y":(v_y - 1), "m":alphaMax, "r":alphaRep});
		}
	}//==========================================================================
	}//end if in bitmap bounds
	//console.log(nextPix.length);
	if(chunkPix > 100000){//Large number of pixels processed, break it into chunks so there are not lag spikes on the user experience.
		this.floodPix = nextPix;
		this.floodColor = v_colorToUse;
		this.floodTarget = v_color2Replace;
		chunkExit = true;
		setTimeout(this.bucketFill, 0);
		break;
	}
	chunkPix++;
	}//end while
	if(!chunkExit){//If exited due to being finished, not to split up processing into chunks.
		//Do not need DONE state to transfer to the channel system, floods are put directly onto the channels as it goes along, just STOP.
		this.curToolState = GraFlicImage.TOOL_STATE_STOP;
		this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);
	}
	//console.log('end of fill func');
	this.requestRedraw();
};
GraFlicImage.prototype.stopFlood = function(){
	this.floodStopped = true;
};
GraFlicImage.prototype.plugWires = function(){
	this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);
	var plugWA = this.a.f[this.curImage.chan_a].d;
	var plugFI = this.a.f[this.curImage.chan_f].d;
	var maxX = this.cvM.width;
	var maxY = this.cvM.height;
	var plugScore;
	var plugAround;
	var plugAroundCount;
	var plugAroundFill;
	var plugAroundFCount;
	var plugThresh = 0;
	var plugSafeL, plugSafeR, plugSafeT, plugSafeB;
	for(var i = 0;i < plugWA.length;i++){
		if(!plugFI[i]){//If not filled on the Fill channel
			plugAround = 0;
			plugAroundCount = 0;
			plugAroundFill = 0;
			plugAroundFCount = 0;
			plugSafeL = i % maxX ? true : false;
			if(plugSafeL){
				if(plugWA[i - 1] - plugThresh > plugWA[i]){//If not at the left edge
					plugAround += plugWA[i - 1] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i - 1] && plugWA[i - 1]){
					plugAroundFill = plugFI[i - 1];
					plugAroundFCount++;
				}
			}
			plugSafeR = i % maxX != 1;
			if(plugSafeR){
				if(plugWA[i + 1] - plugThresh > plugWA[i]){//If not at the right edge
					plugAround += plugWA[i + 1] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i + 1]){
					plugAroundFill = plugFI[i + 1];
					plugAroundFCount++;
				}
			}
			plugSafeT = i >= maxX;
			if(plugSafeT){
				if(plugWA[i - maxX] - plugThresh > plugWA[i]){//If not at the bottom edge
					plugAround += plugWA[i - maxX] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i - maxX]){
					plugAroundFill = plugFI[i - maxX];
					plugAroundFCount++;
				}
			}
			plugSafeB = i + maxX < plugWA.length;
			if(plugSafeB){
				if(plugWA[i + maxX] - plugThresh > plugWA[i]){//If not at the top edge
					plugAround += plugWA[i + maxX] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i + maxX]){
					plugAroundFill = plugFI[i + maxX];
					plugAroundFCount++;
				}
			}
			if(plugSafeB && plugSafeL){
				if(plugWA[i + maxX - 1] - plugThresh > plugWA[i]){
					plugAround += plugWA[i + maxX - 1] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i + maxX - 1]){
					plugAroundFill = plugFI[i + maxX - 1];
					plugAroundFCount++;
				}
			}
			if(plugSafeB && plugSafeR){
				if(plugWA[i + maxX + 1] - plugThresh > plugWA[i]){
					plugAround += plugWA[i + maxX + 1] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i + maxX + 1]){
					plugAroundFill = plugFI[i + maxX + 1];
					plugAroundFCount++;
				}
			}
			if(plugSafeT && plugSafeL){
				if(plugWA[i - maxX - 1] - plugThresh > plugWA[i]){
					plugAround += plugWA[i - maxX - 1] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i - maxX - 1]){
					plugAroundFill = plugFI[i - maxX - 1];
					plugAroundFCount++;
				}
			}
			if(plugSafeT && plugSafeR){
				if(plugWA[i - maxX + 1] - plugThresh > plugWA[i]){
					plugAround += plugWA[i - maxX + 1] - plugWA[i];
					plugAroundCount++;
				}
				if(plugFI[i - maxX + 1]){
					plugAroundFill = plugFI[i - maxX + 1];
					plugAroundFCount++;
				}
			}
			plugScore = plugAround + plugAroundCount * 150 + plugAroundFCount * 150;
			if( plugScore >= 2000//(plugAround >= 500 && plugAroundCount >= 3 || plugAroundCount >= 6)
				&& plugAroundFill ){
				plugFI[i] = plugAroundFill;
			}
		}
	}
	this.requestRedraw();
};


GraFlicImage.prototype.getMouseCalibratedXY = function(v_evt){
	//Based on the scale and position of the canvas in the DOM,
	//the XY needs to be adjusted to where it would relate to on the canvas coordiantes
	//NOTE: If canvas is not on positioned 0,0 in the DOM the X/Y might have to have the position X/Y subtracted...
	var cScale = this.cvM.clientWidth/this.cvM.width;
	//alert(this.cvM.parentNode.offsetX + ', ' + this.cvM.scrollX);
	v_evt.preventDefault();//Prevent both a mouse and touch from firing at the same time.
	var v_x;//If mouse, not touch, use the x/y on the mouse event
	var v_y;
	if(v_evt.touches){
		var v_touch;
		console.log('got touch');
		//Touches must be handled to work on both desktop and mobile.
		v_touch = v_evt.touches.item(0);
		if(v_touch){//touchend does not generate any touches.\
			this.lastTouchPos = v_touch;//Mouse up will need to know where the finger is to simulate a mouse up on touch. Touch end does not give the coordinates of where the touch ended so it must be saved at where it was from the move or start.
		}else{
			v_touch = this.lastTouchPos;
		}
		v_x = (v_touch.pageX - this.cvM.offsetLeft + this.cvM.parentNode.scrollLeft) / cScale;
		v_y = (v_touch.pageY - this.cvM.offsetTop + this.cvM.parentNode.scrollTop) / cScale;
		console.log(this.cvM.parentNode.scrollTop);
	}else{
		v_x = v_evt.offsetX / cScale;
		v_y = v_evt.offsetY / cScale;
	}
	if(v_evt.pressure === undefined){
		//console.log('no pointer event available');
		v_evt.pressure = 0.5;//If browser does not support PointerEvent/pressure, set it to the default in the middle.
	}
	//console.log(v_evt.pressure);
	return [v_x, v_y];
};
GraFlicImage.prototype.isStrokeBasedTool = function(){
	return	   this.curTool == GraFlicImage.TOOL_PEN
		|| this.curTool == GraFlicImage.TOOL_BRUSH
		|| (this.curTool == GraFlicImage.TOOL_CUT_LASSO && this.cutBitmap == null);
};
GraFlicImage.prototype.mDown = function(v_evt){
	var v_calXY = this.getMouseCalibratedXY(v_evt);
	var v_x = v_calXY[0];
	var v_y = v_calXY[1];
	//TODO: Implement pressure/pointer event.
	if(this.curImage.type == 'WAIFU'){
		if(this.isStrokeBasedTool()){
			//lasso cutter will also use these strokes, but fill between and use it as a mask to cut.
			this.curStroke = [v_x, v_y, v_evt.pressure * 2];
			this.curToolState = 100;
		}
		if(this.curTool == GraFlicImage.TOOL_BOUNDS_CROP){
			//Tools that use the tool state, but does not track strokes.
			this.curToolState = 100;
		}
	}//end bitmap
	//this.wasX = this.cutX;//may be used for various dragging calculations.
	//this.wasY = this.cutY;
	this.dragStartX = v_x;
	this.dragStartY = v_y;
	this.minRegionX = v_x;//keep track of what region has been dragged over.
	this.minRegionY = v_y;
	this.maxRegionX = v_x;
	this.maxRegionY = v_y;
	this.isDragging = true;
};
GraFlicImage.prototype.mMove = function(v_evt){
	var v_calXY = this.getMouseCalibratedXY(v_evt);
	var v_x = v_calXY[0];
	var v_y = v_calXY[1];
	this.dragPrevX = this.dragCurX;
	this.dragPrevY = this.dragCurY;
	this.dragCurX = v_x;
	this.dragCurY = v_y;
	
	if(this.isDragging){//========================================================
	this.minRegionX = Math.min(v_x, this.minRegionX);//keep track of what region has been dragged over.
	this.minRegionY = Math.min(v_y, this.minRegionY);
	this.maxRegionX = Math.min(this.a.j.save.canvas_width, Math.max(v_x, this.maxRegionX));
	this.maxRegionY = Math.min(this.a.j.save.canvas_height, Math.max(v_y, this.maxRegionY));
	if(this.curImage.type == 'WAIFU'){
		if(this.isStrokeBasedTool() && this.curStroke.length){//pen (do not extent until the wire is started with one x,y coord from mousedown.)
			//cut should only make the stroke if there is no cut BMP yet, otherwise it should drag the existing one.
			var v_prevX = this.curStroke[this.curStroke.length - 3];
			var v_prevY = this.curStroke[this.curStroke.length - 2];
			if(Math.abs(v_x - v_prevX) + Math.abs(v_y - v_prevY) > 2){
				//Do not make a new coord for very short distance,
				//it will all clump together and lose the antialiased effect.
				this.curStroke.push(v_x, v_y, v_evt.pressure * 2 * this.penWidth);
				//0.5 * 2 is 1.0 for normal scale. 0.25 would be 0.5, 0.75 would be 1.5, etc...
			}
			//Request redraw only for the region that is being changed.
			//-1 to avoid out of bounds error
			this.requestRedraw(this.minRegionX, this.minRegionY, this.maxRegionX, this.maxRegionY);
		}
		if(this.curTool == GraFlicImage.TOOL_CUT_LASSO && this.isDragging && this.curToolState == 0){
			this.cutBitmap.x += Math.round(this.dragCurX - this.dragPrevX);
			this.cutBitmap.y += Math.round(this.dragCurY - this.dragPrevY);
			//console.log(this.cutX + ', ' + this.cutY)
			this.requestRedraw();
		}
		if(this.curTool == GraFlicImage.TOOL_BOUNDS_CROP){
			//Tools that use the tool state, but does not track strokes.
			this.requestRedraw();
		}
		if( this.curTool == GraFlicImage.TOOL_BOUNDS_MOVE){
			//Move does not need to manipulate the tool state since it simply changes object parameters.
			this.curImage.x += Math.round(this.dragCurX - this.dragPrevX);
			this.curImage.y += Math.round(this.dragCurY - this.dragPrevY);
			this.requestRedraw();
		}
	}//end bitmap
	}//======================= end isDragging ==========================
};
GraFlicImage.prototype.mUp = function(v_evt){
	var v_calXY = this.getMouseCalibratedXY(v_evt);
	var v_x = v_calXY[0];
	var v_y = v_calXY[1];
	this.dragStopX = v_x;
	this.dragStopY = v_y;
	if(this.curImage.type == 'WAIFU'){
		if(this.isStrokeBasedTool()){//pen
			this.curToolState = 200;
			//The redraw MUST be requested on finish, since the drawing code contains the section that commits the final stroke.
			if(this.curTool == GraFlicImage.TOOL_CUT_LASSO){
				this.requestRedraw(this.minRegionX, this.minRegionY, this.maxRegionX, this.maxRegionY);
				//OLD: this.requestRedraw();//OLD: Must draw the whole region so that the lasso is not misaligned when copying over in the cut code. If variable sized bitmaps are implemented, this limitation may not be needed.
			}else{
				this.requestRedraw(this.minRegionX, this.minRegionY, this.maxRegionX, this.maxRegionY);
			}
		}//end pen
		if(this.curTool >= 200 && this.curTool < 300){//bucket
			//flood tool range reserved from 200-299
			this.bucketFill(v_x, v_y);
		}
		if(this.curTool == GraFlicImage.TOOL_BOUNDS_CROP){
			var cBoxX = Math.min(this.dragStartX, this.dragStopX);
			var cBoxY = Math.min(this.dragStartY, this.dragStopY);
			var cBoxW = Math.max(this.dragStartX, this.dragStopX) - cBoxX;
			var cBoxH = Math.max(this.dragStartY, this.dragStopY) - cBoxY;
			var cShiftX = cBoxX - this.curImage.x;//handle areas that have been cut out of view to the left and top. Or that have been pushed over while the bitmap object is moved leftward/upward.
			var cShiftY = cBoxY - this.curImage.y;
			if(cBoxW && cBoxH){//dimensions for a bitmap must be non-zero.
				this.cropBitmap(this.curImage, cShiftX, cShiftY, cBoxW, cBoxH);
			}
			this.curImage.x = cBoxX;
			this.curImage.y = cBoxY;
			this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);
			this.curToolState = 0;
			this.requestRedraw();
		}
		if( this.curTool == GraFlicImage.TOOL_BOUNDS_MOVE){
			this.pushUndoStack(GraFlicImage.UNDO_IMAGE_PROPS);
		}
	}//end bitmap
	this.isDragging = false;
};


GraFlicImage.prototype.commitCutMove = function(){
	//This will merge the cut BMP onto the current BMP.
	//If the current bitmap has been changed, note that it is also moved to another layer.
	//if this.cutX this.a.j.save.canvas_height
	//console.log('Committing cut move.');
	var v_srcI, v_copyI;
	var cmX1 = Math.max(this.cutBitmap.x, this.curImage.x);
	var cmY1 = Math.max(this.cutBitmap.y, this.curImage.y);
	var cmX2 = Math.min(this.cutBitmap.x + this.cutBitmap.w, this.curImage.x + this.curImage.w);
	var cmY2 = Math.min(this.cutBitmap.y + this.cutBitmap.h, this.curImage.y + this.curImage.h);
	for(var h = cmY1;h < cmY2;h++){
	for(var w = cmX1;w < cmX2;w++){
	//for(var v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
		v_copyI = (h - this.curImage.y) * this.curImage.w + w - this.curImage.x;
		v_srcI = (h - this.cutBitmap.y) * this.cutBitmap.w + w - this.cutBitmap.x;
		//v_srcI = v_copyI - this.cutBitmap.x - Math.round(this.cutBitmap.y * this.a.j.save.canvas_width);
		//palette indices in the cut bitmap override the current ones
		if(this.a.f[this.cutBitmap.chan_f].d[v_srcI]){
			//The following makes a fill on the cut part cover any wires on the destination,
			//this behavior may be overridable in the future.
			this.a.f[this.curImage.chan_a].d[v_copyI] = 0;
			this.a.f[this.curImage.chan_i].d[v_copyI] = 0;
			this.a.f[this.curImage.chan_f].d[v_copyI] = this.a.f[this.cutBitmap.chan_f].d[v_srcI];
		}
		if(this.a.f[this.cutBitmap.chan_i].d[v_srcI]){
			this.a.f[this.curImage.chan_i].d[v_copyI] = this.a.f[this.cutBitmap.chan_i].d[v_srcI];
		}
		this.a.f[this.curImage.chan_a].d[v_copyI] |= this.a.f[this.cutBitmap.chan_a].d[v_srcI];
	//}
	}}
	//Delete virtual files no longer needed to save memory.
	this.a.deleteFile(this.cutBitmap.chan_a);
	this.a.deleteFile(this.cutBitmap.chan_i);
	this.a.deleteFile(this.cutBitmap.chan_f);
	this.a.deleteFile('b/' + this.cutBitmap.id + '/');
	this.cutBitmap = null;//the cutBMP is now empty after it was merged to another bitmap.
	//TODO: needs to handle for both the source and the destination to where the cut is pasted (if cut moved to a different image).
	this.pushUndoStack(GraFlicImage.UNDO_BITMAP_PIXELS);
	this.requestRedraw();//The cut adds a bitmap for the cut area, so request a redraw.
};


GraFlicImage.prototype.export = function(v_imgSMode){
	//set gImg.encoder.* to configure encoder settings.
	
	if(v_imgSMode){
		this.imageSaveMode = v_imgSMode;//use 2 for thumb
	}
	if(this.frameDrawingForSave == -1){//in pre-init state -1
		this.encoder.frames = [];
		//clear and rebuild the metadata if present
		if(this.encoder.metadata){delete this.encoder.metadata;}
		for(var v_key in this.a.j.meta.general){
			if(!this.encoder.metadata){this.encoder.metadata = {};}
			this.encoder.metadata[v_key] = this.a.j.meta.general[v_key];
		}
		this.frameDrawingForSave++;
	}
	if(this.frameDrawingForSave == this.a.j.save.frames.length){
		this.encoder.delay = this.a.j.save.global_delay;
		this.encoder.saveAnimatedFile();
		return;
	}

	//Draw all layers that will be on the current frame being drawn for save.
	var v_images2Draw = [];
	var v_i2dParams;
	for(var v_i = 0;v_i < this.a.j.save.images.length;v_i++){
		var v_img2Draw = this.a.j.save.images[v_i];
		var v_imgDoInsert = false;
		if(v_img2Draw.plays_on_all_frames){v_imgDoInsert = true;}
		for(var v_i2 = 0;v_i2 < v_img2Draw.plays_on_frames.length;v_i2++){
			if(v_img2Draw.plays_on_frames[v_i2] == this.a.j.save.frames[this.frameDrawingForSave].id){
				//Draw all layers that play on the current frame BEING SAVED.
				v_imgDoInsert = true;
				break;
			}
		}
		if(v_imgDoInsert){
			v_i2dParams = {};
			v_i2dParams.image = v_img2Draw;
			v_i2dParams.onionAlpha = 1;
			v_images2Draw.push(v_i2dParams);
		}
	}
	this.drawFrame(v_images2Draw);

	var v_frameBeingDrawn = this.a.j.save.frames[this.frameDrawingForSave];
	var v_frameParams = {};
	if(v_frameBeingDrawn.delay !== undefined){//undefined for auto/default delay
		v_frameParams.delay = v_frameBeingDrawn.delay;
	}
	
	var v_saveScale;
	if(this.encoder.png){//Only fill this in if advanced parameters needed.
		delete this.encoder.png;
	}
	if(this.imageSaveMode == 1){//export to PNG
		v_saveScale = this.a.j.save.save_scale;
		this.encoder.quality = this.a.j.save.export.quality;
		if(this.a.j.save.export.png && this.a.j.save.export.png.brute){
			this.encoder.png = {};
			this.encoder.png.brute = this.a.j.save.export.png.brute;
		}
	}
	if(this.imageSaveMode == 2){//thumb
		//Make 256 x 256 thumb. If non-square, the maximum w/h dimension is 256, the other maintains aspect ratio.
		v_saveScale = Math.min(256 / this.cvM.width, 256 / this.cvM.height);
		this.encoder.quality = 0.5;
	}
	
	var v_scaleDownCV = document.createElement('canvas');
	v_scaleDownCV.width = Math.round(this.cvM.width * v_saveScale);
	v_scaleDownCV.height = Math.round(this.cvM.height * v_saveScale);
	var v_scaleDownCX = v_scaleDownCV.getContext('2d');
	v_scaleDownCX.drawImage(this.cvM, 0, 0, this.cvM.width, this.cvM.height, 0, 0, v_scaleDownCV.width, v_scaleDownCV.height);
	
	v_frameParams.image = new Image();
	v_frameParams.image.src = v_scaleDownCV.toDataURL();

	this.frameDrawingForSave++;
	this.encoder.addFrame(v_frameParams);
};

GraFlicImage.prototype.onExportFrameAddedUnbound = function(){
	//alert('frame added');
	setTimeout(this.exportBound, 100);//repeat until all frames drawn and AE save process is called.
};

GraFlicImage.prototype.onExportEncodedUnbound = function(v_ae){
	//alert('encoded');
	//alert(this.encoder.output);
	this.frameDrawingForSave = -1;//set back to not saving state.
	if(this.imageSaveMode == 1 && this.onExported){
		this.onExported(v_ae);
	}
	if(this.imageSaveMode == 2){
		this.saveArchiveStage2();
	}
};

GraFlicImage.prototype.saveArchive = function(v_params){
	this.export(2);
};


GraFlicImage.prototype.saveArchiveStage2 = function(){//Call this after the thumb has been generated.
	var v_fileEntry;
	
	if(this.encoder.outputOctetStream){
		//Add the thumb to the virtual archive. This will overwrite any previous thumb that had been added.
		/*v_fileEntry = {};//ensure thumbs directory is there. (Directories auto-created when needed now.)
		v_fileEntry.p = 't/';
		this.a.addFile(v_fileEntry);*/
		
		v_fileEntry = {};
		v_fileEntry.p = 't/t256.png';
		v_fileEntry.d = this.encoder.outputOctetStream;
		//v_fileEntry.b = this.encoder.output;
		this.a.addFile(v_fileEntry);
	}

	
	/*
	var v_bitmapsJSON = [];//A raw array can go into JSON with no object wrapper.
	for(v_i = 0;v_i < this.a.j.save.images.length;v_i++){
		var v_bJSON = {};
		for(var v_key in this.a.j.save.images[v_i]){
			var v_val = this.a.j.save.images[v_i][v_key];
			if( (typeof v_val).match(/(string|number|boolean)/i)
				|| v_key == 'plays_on_frames' ){
				//plays_on_frames is a simple array of numbers, but arrays eval as type 'object'
				//Only JSONify the values that can be represented in JSON efficiently and/or at all.
				//(No Uint8Arrays or refs to other objects somewhere else that could loop and tangle)
				v_bJSON[v_key] = v_val;
			}
		}
		//These channel Uint8Arrays would not be efficient to store in JSON if they would work at all.
		//A link to the virtual file that has the channel will be inserted instead.
		//After the files have all been extracted, these vars can be assigned to the actual bytes.
		//save as general .dat file. Bit depth will be determinable from the bitmaps JSON if something gets switched to 16 bit depth to support 48 bit color or more than 255 palette colors.
		//@z: will be used to notate the location it is '@'(at) within the 'z'ip save file. This will not conflict with future protocols because schemes must start with alpha-ASCII according to RFC. This is not a proper protocol, just a pseudo-scheme to be used internally for linking/reconstructing data that is not storable or not efficient to be stored in JSON.
		//This functionality would not be interoperable as a public protocol/scheme anyways, because it is referencing something that only exists in memory within the app or that is relative to and dependent on the app.
		//The variable-specific context should determine how to handle this. In some cases (like here) it overwrites the variable that contains. In other cases it is a link used to build some other runtime variable. In that case a BLOB might be built based on the contents of the file to be assigned to something else. (A user could always enter '@z:' into a text component, so do not go thru every var and attempt to extract stuff into it just because it has '@z:'.)
		//Some JSON variables for zip based formats may take several types of links, like 'https://site.tld/path/file.png' or simply 'path/file.png'.
		//'@a:'(or maybe '@r:' or '@app:' or '@i' for internal) might be introduced later to link to a static file within the web-app 'a'ssets root folder. '@a:path/file.png'
		//In some cases there might be other types of links like direct http link to a static file on a website.
*/
/*
This could be used for an asset loader for lots of small images files for web pages, so that only one connection to the server is opened to download them all at once.
However, that can create accessibility and search indexing issues, so doing that with a JavaScript solution should be avoided, at least for essential content. It might be ok for supplemental or aesthetic things that do not need to be indexed.
If/when an actual standard way to do this is built into browsers, then do that with the standard way. A standard way would work something like this:

<head>
...
	<link rel="archive" href="/files/Images.zip"/>
...
</head>
<body>
...
<img src="archive:Images.zip#folder_name/image.png"/>
...
</body>

archive:<archive path>#<path to file within archive>
Archive path could be just the filename like Images.zip, or it could be more specific to avoid collisions with multiple zip files like this:
<img src="archive:https://example.AnimatedPNGs.com/files/Images.zip#folder_name/image.png"/>
Delimit with # because that is not sent as part of a request to a server, it is used in URLs to point to something within a page/file.
If really needing to link to a page within the zip and a # anchor within that page it could be done with:
archive:Pages.zip#test_page.html#anchor

Ideally ZIP loading would be built directly into the browsers. In that case, just wait for the zip to be loaded then do whatever needed with the canvas drawing and code using the links to BLOBs within the zip as src attributes.
This would be very useful when there are lots of small files like image graphics used for buttons and things. This way only one connection is opened to download the .zip file. Other common archive types like .tar.gz (GZip compressed .tar) could possibly be supported too.
It would essentially function like a BLOB link for a BLOBs that are loaded into memory when the ZIP finishes downloading. 

However there is no knowledge of a feature like this being implemented into browsers directly. So for now use the internal @z: link until if/when something like that is implemented and the public protocol scheme is known. It can always be swapped with something else if interoperable ZIP loading is ever implemented in the browsers directly.

The JS would look for the rel="archive" link. If it is there, it would load the ZIP and keep all the files in memory as a global shared asset for the page, rather than just returning it to be used by whatever save/load functionality.

<custom:link rel="archive" href="/files/Images.zip"/>

Then once it is loaded use JS to find all the IMGs with custom attributes with zip links and change the src to point to the BLOB that is now in memory. Links like this:

<img src="placeholder.png" custom:zrc="@z:Images.zip#folder_name/image.png"/>


*/
/*
		//Use .dat.gz and do the GZip compression BEFORE sending it to the ZIP archiver, which will use 0 no compression for .gz.
		//That way when the user uncompresses the ZIP the .dat files with raw data that is not easy to edit for the user
		//does not hot lots of disk space. Unlike .json or .txt, the raw binary data in the project-specific format
		//is not easy to open up and edit directly, if they really want to they can decompress the extracted .gz first.
		//Like images (png/jpeg/etc) that handle their own compression and store with mode 0 no compression, .dat.gz does the same.
		v_bJSON.chan_i = '@z:bitmaps/Wire_I_' + v_i + '.dat.gz';
		v_bJSON.chan_a = '@z:bitmaps/Wire_A_' + v_i + '.dat.gz';
		v_bJSON.chan_f = '@z:bitmaps/Fill_I_' + v_i + '.dat.gz';
		v_bitmapsJSON.push(v_bJSON);
	}
	v_fileEntry = {};
	v_fileEntry.p = 'bitmaps.json';
	v_fileEntry.j = v_bitmapsJSON;
	v_zSave.addFile(v_fileEntry);

	
	//pako deflate Options(use pako.gzip()/ungzip(), not deflate(), not deflateRaw() for .gz compression with full GZip headers/footers)
	var v_pakoDO = {
		"windowBits":15,
		"memLevel":9,
		"level":9
	};
	var v_procBMP;
	for(v_i = 0;v_i < this.a.j.save.images.length;v_i++){
		v_procBMP = this.a.j.save.images[v_i];
		v_fileEntry = {};
		v_fileEntry.p = 'bitmaps/Line_A_' + v_i + '.dat.gz';
		v_fileEntry.d = window.pako.gzip(v_procBMP.chan_a, v_pakoDO);
		v_zSave.addFile(v_fileEntry);
		v_fileEntry = {};
		v_fileEntry.p = 'bitmaps/Line_I_' + v_i + '.dat.gz';
		v_fileEntry.d = window.pako.gzip(v_procBMP.chan_i, v_pakoDO);
		v_zSave.addFile(v_fileEntry);
		v_fileEntry = {};
		v_fileEntry.p = 'bitmaps/Fill_I_' + v_i + '.dat.gz';
		v_fileEntry.d = window.pako.gzip(v_procBMP.chan_f, v_pakoDO);
		v_zSave.addFile(v_fileEntry);
	}
	*/
	//if(this.savedWorkFile){//Clear previous save to stop memory leak.
	//	this.savedWorkFile.revokeAll();
	//}(move this to new archive loaded that overwrites.)
	this.a.saveBLOB();
	//this.savedWorkFile = v_zSave;//(move this to new archive loaded that overwrites.)
	if(this.onArchived){
		this.onArchived(this.a);
	}
};





GraFlicImage.prototype.fileSelectLoaderUnbound = function(v_evt){
	//add an event handler with ('change', gi.fileSelectLoader) to handle loading saves to restore a project or just playback.
	this.loadedFilename = v_evt.target.files[0].name;//used to check for common ZIP packing mistake.
	this.tempFR = new FileReader();
	this.tempFR.addEventListener('load', this.fileSelectLoadedHandler);
	this.tempFR.readAsArrayBuffer(v_evt.target.files[0]);
};
GraFlicImage.prototype.fileSelectLoadedHandlerUnbound = function(){
	//Call the bound version of this without Unbound that has been set up on init.
	this.loadFromU8A(new Uint8Array(this.tempFR.result));
	delete this.tempFR;
};
GraFlicImage.prototype.loadFromU8A = function(v_u8a){
	this.a.revokeAll();
	this.a = new GraFlicArchive(v_u8a);
	GraFlicUtil.absorbJSON(this.a.j.meta, this.initMetadata());
	//Note that when manually editing JSON some text editors put in non-ASCII quotations causing load failure.
	this.curImage = this.a.j.save.images[this.a.j.save.selected_image_index];
	this.cutBitmap = null;
	this.curFrame = this.a.j.save.frames[this.a.j.save.selected_frame_index];
	this.curPalette = this.a.j.save.palettes[this.a.j.save.selected_palette_index];//TODO: implement cascading
	this.curPaletteColor = this.curPalette.colors[this.a.j.save.selected_color_index];
	//TODO: make sure any settings saved in the JSON have their UI updated on load.
	//f_calcBitmapSizes();//these being off can mess calculations up elsewhere, so make sure this is set correct first
	/*for(var k in this.a.f){
		console.log(this.a.f[k].p + ' / ' + this.a.f[k].d);
	}*/
	//Send the flags for size change AND bitmap pixels, so that it will now to copy the pixels for ALL images. Each image must start with something to undo to when the image is started or restored.
	this.clearUndoRedo();
	this.systemChangeCanvasSize(GraFlicImage.UNDO_IMAGE_ALL | GraFlicImage.UNDO_BITMAP_PIXELS, this.a.j.save.canvas_width, this.a.j.save.canvas_height);
	
	if(this.onLoaded){
		this.onLoaded(this.a);
	}
	//Give embedded images time load after src is set to the blob, then redraw:
	setTimeout(this.requestRedraw, 250);
};



