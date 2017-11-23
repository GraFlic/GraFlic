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
	
	
	this.penWidth = 2.5;
	this.penOpacityAnalysis = {};//Pen strokes need to have full opacity at the center of the stroke to work with the fill tool and not leak. Using FULL opacity as the edge is important because images should not have stray bits of slightly transparent pixels randomly in them. That can mess up pixel recycling between APNG frames and force a full clear of the region to update it. This var should NOT be saved in the JSON with the save file. There is a chance that the behavior of wire stroke varies slightly between browsers. This needs to be recalculated on each runtime.
	this.curStroke = [];
	this.curTool = 1;
	//1 = pen
	//2 = fill bucket
	//3 = wire bucket
	//300 = lasso cutter
	this.curToolState = 0;//tool state
	//0 = inactive
	//100 = drawing
	//200 = finished and/or ready to transfer to custom bitmap channels (wire_index/wire_alpha/fill_index)
	this.curDrawMode = 1;//0 for erase, 1 for draw

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
	this.changeCanvasSize(512, 512, 0);//Make sure the size is initialized to with all the things that need to be set.
	this.a.j.save.save_scale = 0.5;
	//============ set global variables that reset on new image ============
	//colors are drawn by inserting an index to a palette entry, rather than a color code, that way palette colors can be swapped and updated dynamically.
	//palette[0] should always be considered fully transparent
	this.curPalette = this.initPalette();
	this.curPalette.cascade = -9999;//This will be the 'default' palette. All others should cascade over it.
	this.curPalette.default = true;//Non-default palettes may only override some colors and rely on the default to ensure every used index has a color.
	this.a.j.save.palettes = [this.curPalette];//Init palette array.
	this.a.j.save.selected_palette_index = 0;
	this.fillBucketNextPixels = {};//used to handle area fills that have trouble with JS call-stack limits.
	this.a.j.save.onion_skin_on = false;
	this.a.j.save.stain_glass_on = false;//Makes fill areas more see-thru so that multiple layers are easier to see.
	
	//----------------------------------------------

	//=========== build default palette ============
	this.newPaletteColorRGBA(0, 0, 0, 0, '🏁');//palette[0] should ALWAYS be fully transparent
	this.newPaletteColorRGBA(0, 0, 0, 1, '🏴');//Default to true black for color [1].
	this.newPaletteColorRGBA(1, 1, 1, 1, '🏳');//Default to true white for color [2].
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
	
	
	this.wasX;//Used for dragging.
	this.wasY;
	this.dragStartX;
	this.dragStartY;
	this.isDragging = false;
	this.cutBitmap = null;//For cut-paste functionality. null if nothing pasted.
	this.cutX = 0;//allows the dragging of the cut section.
	this.cutY = 0;
	
	//Now setup playback.
	this.updateCanvasVisuals = this.updateCanvasVisualsUnbound.bind(this);//binding needed for it to handle this keyword correctly.
	window.requestAnimationFrame(this.updateCanvasVisuals);
	this.requestRedraw();


	//hook up events
	//TODO: parameter to turn this off if only playback, not drawing is wanted.
	this.cvM.addEventListener('mousedown', this.mDown.bind(this));
	this.cvM.addEventListener('mousemove', this.mMove.bind(this));
	this.cvM.addEventListener('mouseup', this.mUp.bind(this));
	this.cvM.addEventListener('touchstart', this.mDown.bind(this));//Also add these handlers as touch so that it works on mobile.
	this.cvM.addEventListener('touchmove', this.mMove.bind(this));
	this.cvM.addEventListener('touchend', this.mUp.bind(this));
	
	this.bucketFillBound = this.bucketFill.bind(this);//Used for bucket fills to make this keyword work.
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
	//Change metadata.text to .general, to make it more consistent with how GraFlicEncoder .metadata works
	//Instead of having .text be just text, it could be any value, if 'typeof' text, it can be inserted as a tEXt or iTXt entry for PNG,
	//If typeof 'object' it could have a structure used to build other types of metadata like pHYs or colorspace entries.
	//If it is an object, then it might look for something like '.meta_type' and if the encoder has a way to handle that, it will
	//insert it in the standard way for the output format, and if not recongnized, it will be ignored.
	return v_metadata;//return the initialized object, useful for making sure required init properties are there for parsed JSON.
};

GraFlicImage.prototype.calcBitmapSizes = function(){
	//TODO: Additional logic will be needed her if supporting 16 bit depth for more palette entries or 48 bit color with 16 bit alpha.
	//use this.a.j.save.index_bit_depth, this.a.j.save.alpah_bit_depth ( / 8 for number of bytes per pixel)
	//NOTE: In some cases if bit depth is increased only some channels will be increased. For example 16 bit depth for more palette indices than 255, but NOT moving to 16 bit alpha to support 48 bit color.
	this.channelBitmapBytes = this.a.j.save.canvas_width * this.a.j.save.canvas_height;
	this.rgba32BitmapBytes = this.a.j.save.canvas_width * this.a.j.save.canvas_height * 4;//Each custom channel will be on its own array of W*H.
	//A channel for wire color index,
	//A channel for wire color anti-alias alpha
	//A channel for fill color index (a flat color that fills in under shapes and slides under the anti-aliased parts to blend)
	//With each channel on its own array, other channels can be added later if needed.
	//TODO: Supporting channels that can contain extra data that is context-dependent on palette type, like representing the position in the gradient blended between two colors.
};

GraFlicImage.prototype.changeCanvasSize = function(v_csW, v_csH, v_csCropMode, v_startX, v_startY){
	this.undoStack = [];//Clear this since the sizes won't match. TODO: Could adjust this to make redos available after a canvas size change.
	this.redoStack = [];
	this.pushUndoStack();//Make the initial state to undo to before anything is drawn.
	var v_canvasWidthOld = this.a.j.save.canvas_width;
	var v_canvasHeightOld = this.a.j.save.canvas_height;
	//alert(v_canvasWidthOld + ' x ' + v_canvasHeightOld);
	this.a.j.save.canvas_width = v_csW;
	this.a.j.save.canvas_height = v_csH;
	this.calcBitmapSizes();//Now that W/H has changed, adjust the byte size per channel
	//cycle thru the bitmaps and adjust them to the new size.
	//var v_minCropX = 0;
	//var v_minCropY = 0;
	//var v_maxCropX = v_csW;
	//var v_maxCropY = v_csH;
	var v_oldWAdjust = 0;//position to start copying from (if negative, copy will be ignored until in range)
	var v_oldHAdjust = 0;
	if(v_startX !== undefined){//if start x/y are defined, they are integers of where to start cropping from. If negative, it shift pixels right/down instead of crop.
		v_oldWAdjust = v_startX;
	}
	if(v_startY !== undefined){
		v_oldHAdjust = v_startY;
	}
	var v_wOld;
	var v_hOld;
	var v_oldPixI = 0;
	var v_newPixI = 0;
	for(var v_i = 0;v_i < this.a.j.save.images.length;v_i++){
		var v_changeB = this.a.j.save.images[v_i];
		if(v_changeB.type == 'WAIFU'){//=== only bitmaps need channels adjusted =============================================
		var v_oldLineI = this.a.f[v_changeB.chan_wi].d;
		var v_oldLineA = this.a.f[v_changeB.chan_wa].d;
		var v_oldFillI = this.a.f[v_changeB.chan_fi].d;
		this.a.f[v_changeB.chan_wi].d = new Uint8Array(new ArrayBuffer(this.channelBitmapBytes));
		this.a.f[v_changeB.chan_wa].d = new Uint8Array(new ArrayBuffer(this.channelBitmapBytes));
		this.a.f[v_changeB.chan_fi].d = new Uint8Array(new ArrayBuffer(this.channelBitmapBytes));
		//alert('a');
		for(var v_h = 0;v_h < v_csH;v_h++){
			for(var v_w = 0;v_w < v_csW;v_w++){
				v_newPixI = v_h * v_csW + v_w;
				v_wOld = v_w + v_oldWAdjust;
				v_hOld = v_h + v_oldHAdjust;
				v_oldPixI = v_hOld * v_canvasWidthOld + v_wOld;
				//alert(v_newPixI + ' -- ' + v_oldPixI + ' ' +v_wOld + ', ' + v_hOld +' ... ' + v_canvasWidthOld);return;
				if(v_wOld >= 0 && v_hOld >= 0 && v_wOld < v_canvasWidthOld && v_hOld < v_canvasHeightOld){
					this.a.f[v_changeB.chan_wi].d[v_newPixI] = v_oldLineI[v_oldPixI];
					this.a.f[v_changeB.chan_wa].d[v_newPixI] = v_oldLineA[v_oldPixI];
					this.a.f[v_changeB.chan_fi].d[v_newPixI] = v_oldFillI[v_oldPixI];
				}else{//init to zero anything that is not in the copied region
					this.a.f[v_changeB.chan_wi].d[v_newPixI] = 0;
					this.a.f[v_changeB.chan_wa].d[v_newPixI] = 0;
					this.a.f[v_changeB.chan_fi].d[v_newPixI] = 0;
				}
			}
			//v_oldPixI += this.a.j.save.canvas_widthOld;//old value before this var is changed
			//v_newPixI += v_csW;
		}
		}//=================================================== end bitmap ===================================================
	}
	
	this.cvM.width = this.a.j.save.canvas_width;
	this.cvM.height = this.a.j.save.canvas_height;
	this.cvB.width = this.a.j.save.canvas_width;
	this.cvB.height = this.a.j.save.canvas_height;
	this.cvP.width = this.a.j.save.canvas_width;
	this.cvP.height = this.a.j.save.canvas_height;
};
GraFlicImage.prototype.initImage = function(v_excludeFromArchive){
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
GraFlicImage.prototype.initBitmapWAIFU = function(v_excludeFromArchive){
	//Creates a bitmap in the WAIFU (Wire Alpha / Index, Fill, Unallocated) format.
	//W is more distinguishable than L for line in lowercase. l can be confused with number 1 or uppercase i(I).
	//Wire like the Wire-looking effects when in stained glass view with the fills partially transparent for analysis and to guide by surrounding animation frames.
	//Each channels is in a separate array. Wire Alpha, Wire Index, and Fill (indexed, no alpha) are initially allocated.
	//Supporting channels are initially unallocated, but may be added as needed. Currently not implemented yet.
	//Supporting channels would be used for assigning things like gradients or textures to assign to an index.
	//Other types of bitmaps like traditional RGBA could be added later, but WAIFU is the focus for now to handle the cell-based graphics that Animated PNGs are good at.
	var v_initB = this.initImage(v_excludeFromArchive);
	v_initB.type = 'WAIFU';
	//NOTE: These could be switched to Uint8ClampedArray if issues are encountered. So far there have not been problems and Clamped might have extra overhead.
	//Cann be called with (true) to exclude the bitmap from being part of the project archive. This can be used for things like temporary bitmaps used by the undo stack or cutting.
	//TODO: .bitmap_mode could be used to make special mode bitmaps that instead of having pixel channels, maybe contain a user-loaded image, or reference a previous bitmap and recycle all or part of it. Some bitmaps could be defined as library items to be accessed by other bitmap objects, some of which might just be references to library items and instructions on where to draw them. However, for now it will stick to the basic mode. bitmap_mode being undefined should default to the default mode.
	//This will create the bitmap binary dat files and link them via a string ID so that they are automatically associated
	//when the archive is restored. This is better design than having it directly link to the object,
	//because that would require special handling after it loads.
	//Make an ID for each bitmap because if the order of them gets changed and the ID was based off of the original index, it could have problems.
	//TODO: what if multiple bitmaps are initialized at the exact same millisecond??
	var v_bitmapFolder = 'b/' + v_initB.id + '/';
	
	var v_chanWI = new Uint8Array(new ArrayBuffer(this.channelBitmapBytes));
	var v_chanWA = new Uint8Array(new ArrayBuffer(this.channelBitmapBytes));
	var v_chanFI = new Uint8Array(new ArrayBuffer(this.channelBitmapBytes));
	/*if(v_excludeFromArchive){
		//For the temporary bitmaps such as undo/cut holders, they will not be part of the virtual archive and will link directly to the data instead of having a string linking to the place in the archive.
		v_initB.chan_wi = v_chanWI;
		v_initB.chan_wa = v_chanWA;
		v_initB.chan_fi = v_chanFI;
	}*/
	//else{
		v_initB.chan_wi = v_bitmapFolder + v_initB.id + '_wi.dat.gz';//channel Wire Index
		v_initB.chan_wa = v_bitmapFolder + v_initB.id + '_wa.dat.gz';//channel Wire Alpha
		v_initB.chan_fi = v_bitmapFolder + v_initB.id + '_fi.dat.gz';//channel Fill Index
		
		var v_bFile;
		v_bFile = {};//The folder based on the ID will hold the bitmap channels.
		v_bFile.p = v_bitmapFolder;
		if(v_excludeFromArchive){v_bFile.temp = true;}
		this.a.addFile(v_bFile);
		
		v_bFile = {};
		v_bFile.p = v_initB.chan_wi;
		v_bFile.d = v_chanWI;
		if(v_excludeFromArchive){v_bFile.temp = true;}
		this.a.addFile(v_bFile);

		v_bFile = {};
		v_bFile.p = v_initB.chan_wa;
		v_bFile.d = v_chanWA;
		if(v_excludeFromArchive){v_bFile.temp = true;}
		this.a.addFile(v_bFile);

		v_bFile = {};
		v_bFile.p = v_initB.chan_fi;
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
	var v_liveWI = this.a.f[v_undoBMP.undo_copied_from.chan_wi].d;//pixels live on the screen (link to the live bitmap the undo bitmap was copied from)
	var v_liveWA = this.a.f[v_undoBMP.undo_copied_from.chan_wa].d;
	var v_liveFI = this.a.f[v_undoBMP.undo_copied_from.chan_fi].d;
	var v_tempWI = this.a.f[v_undoBMP.chan_wi].d;//pixels from the undo/redo stack object
	var v_tempWA = this.a.f[v_undoBMP.chan_wa].d;
	var v_tempFI = this.a.f[v_undoBMP.chan_fi].d;
	var v_copyI;
	if(v_revert){//Revert to a previous state.
		for(v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
			//copy the state of the bitmap before it was changed.
			v_liveWI[v_copyI] = v_tempWI[v_copyI];
			v_liveWA[v_copyI] = v_tempWA[v_copyI];
			v_liveFI[v_copyI] = v_tempFI[v_copyI];
		}
	}else{//Copy an existing state to add to the stack.
		for(v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
			//copy the state of the bitmap before it was changed.
			v_tempWI[v_copyI] = v_liveWI[v_copyI];
			v_tempWA[v_copyI] = v_liveWA[v_copyI];
			v_tempFI[v_copyI] = v_liveFI[v_copyI];
		}
	}
};
GraFlicImage.prototype.pushUndoStack = function(){
	//Call this before committing a change to the current bitmap.
	if(this.curImage.type != 'WAIFU'){
		return;//Currently only supports unto to the Bitmap type image.
	}
	this.redoStack = [];//Cannot redo on top of a change that was done after undoing.
	var v_undoBMP = this.initBitmapWAIFU(true);
	v_undoBMP.undo_copied_from = this.curImage;
	//v_undoBMP.name = Math.random();
	this.undoRedoCopy(v_undoBMP, false);
	/*for(var v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
		//copy the state of the bitmap before it was changed.
		v_undoBMP.chan_wi[v_copyI] = this.curImage.chan_wi[v_copyI];
		v_undoBMP.chan_wa[v_copyI] = this.curImage.chan_wa[v_copyI];
		v_undoBMP.chan_fi[v_copyI] = this.curImage.chan_fi[v_copyI];
	}*/
	this.undoStack.push(v_undoBMP);
	if(this.undoStack.length > 20){//Limit stack size to keep resources reasonable.
		//clear the bitmap from the undo stack array and delete it from the archive.
		var sDel = this.undoStack.shift();
		this.a.deleteFile(sDel.chan_wi);
		this.a.deleteFile(sDel.chan_wa);
		this.a.deleteFile(sDel.chan_fi);
		this.a.deleteFile('b/' + sDel.id + '/');
	}
	console.log('undo stack: ' + this.undoStack.length);// + ' n: ' + v_undoBMP.name);
};
GraFlicImage.prototype.undo = function(){
	console.log('undo called. stack: ' + this.undoStack.length);
	if(this.undoStack.length < 2){return;}//must have initial state, plus something drawn since then.
	this.redoStack.push(this.undoStack.pop());//put the current state in the redo stack
	var v_undoBMP = this.undoStack[this.undoStack.length - 1];//undo it to the state that is now at the top of the stack.
	this.undoRedoCopy(v_undoBMP, true);
	//redo stack will not get too large because it has to come out of the undo stack, which is already limited.
	console.log('redo stack: ' + this.redoStack.length);
};
GraFlicImage.prototype.redo = function(){
	console.log('redo called');
	if(!this.redoStack.length){return;}
	var v_undoBMP = this.redoStack.pop();
	//console.log('redoing ' + v_undoBMP.name);
	this.undoRedoCopy(v_undoBMP, true);
	this.undoStack.push(v_undoBMP);
	console.log('undo stack: ' + this.undoStack.length);
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
	if(this.frameDrawingForSave == -1){
		v_drawOnion = this.a.j.save.onion_skin_on ? true : false;
		v_drawStainedGlass = this.a.j.save.stain_glass_on ? true : false;
	}
	//Order any bitmaps sent in the [BMP_OBJ, opacity, ... ] pairs based on z_index
	//Make a COPY of the images array and sort it properly for draw order.
	v_images2Draw = Array.from(v_images2DrawUnordered).sort(
		function(v_v1, v_v2){
			return v_v1.image.z_index - v_v2.image.z_index;//-1 for 1st is less, 1 for 1st is more, 0 for equal.
		}
	);
	//Clear ONLY the region that is being redrawn.
	this.cxM.clearRect(rdX1, rdY1, rdW, rdH);
	this.cxP.clearRect(rdX1, rdY1, rdW, rdH);
	//this.cxM.clearRect(0, 0, this.cvM.width, this.cvM.height);
	//this.cxP.clearRect(0, 0, this.cvP.width, this.cvP.height);
	if((this.curTool == 1 || (this.curTool == 300 && this.cutBitmap == null) ) && this.curStroke.length){//pen
		
		var v_penOA;
		if(this.penWidth >= 2 && this.penWidth < 3){//Lines 3 width and above do not seem to have a problem getting full opacity pixels in the middle.
			var v_indexPOA = this.penWidth.toString();
			if(this.penOpacityAnalysis[v_indexPOA]){
				v_penOA = this.penOpacityAnalysis[v_indexPOA];
			}else{
				v_penOA = {};
				this.penOpacityAnalysis[v_indexPOA] = v_penOA;
				var v_cvPOA = document.createElement('canvas');
				v_cvPOA.width = 200;
				v_cvPOA.height = 200;
				var v_cxPOA = v_cvPOA.getContext('2d');
				v_cxPOA.lineWidth = this.penWidth;
				v_cxPOA.moveTo(20, 20);
				v_cxPOA.lineTo(180, 180);
				v_cxPOA.stroke();
				var v_datPOA = v_cxPOA.getImageData(0, 0, 200, 200);
				var v_darkestAlpha = 0;
				//Count how many times the alpha level occurs. If it is only on a few pixels it can be thrown out as an anomaly.
				var v_alphaCountPOA = new Uint8Array(new ArrayBuffer(256));
				for(v_i = 0;v_i < 160000;v_i += 4){
					if(v_alphaCountPOA[v_datPOA.data[v_i + 3]] < 255){
						//Any alpha count incremented should also increment alphas lower than itself
						//If there are allot of pixels that are close in value like 245, 243, 246
						//count how many are at least that dark
						for(v_i2 = v_datPOA.data[v_i + 3];v_i2 >= 0;v_i2--){
							v_alphaCountPOA[v_i2]++;
						}
					}
				}
				for(v_i = 0;v_i < 256;v_i++){
					if(v_alphaCountPOA[v_i] > 200){
						v_darkestAlpha = v_i;
					}
				}
				v_penOA.full_thresh = Math.max(1, v_darkestAlpha - 32);//0 or less will fill the whole canvas when adjusting.
				//alert('Darkest Alpha found: ' + v_darkestAlpha);
			}
		}
		/*if(true || this.penWidth < 3 && this.penWidth >= 0.5){
			//pen strokes less than 1.5 wide are considered 'detail strokes'
			//and are not expected to define edges where areas can be filled,
			//but may add more precise details for the sake of texture for example
			//small pen sizes are too small to make a fully opaque center, which is needed for color filling detection to fill between the line art.
			this.cxP.beginPath();
			this.cxP.lineWidth = 1;//force a 255 alpha draw with the smallest line behind the line draw so that bucket filling can detect edges and not leave ugly semi-transparent halos around where the fill meets the wire.
			
			this.cxP.moveTo(this.curStroke[0], this.curStroke[1]);
			for(v_i = 2;v_i < this.curStroke.length;v_i+=2){
				this.cxP.lineTo(this.curStroke[v_i], this.curStroke[v_i + 1]);
			}
			
			//this.cxP.strokeStyle = GraFlicImage.getPaletteCSSRGB(this.curPaletteColor);
			//var v_strokeExpand = 0.01;
			//this.cxP.moveTo(this.curStroke[0] - v_strokeExpand, this.curStroke[1] - v_strokeExpand);
			//for(v_i = 2;v_i < this.curStroke.length;v_i+=2){
			//	this.cxP.lineTo(this.curStroke[v_i] - v_strokeExpand, this.curStroke[v_i + 1] - v_strokeExpand);
			//}
			//for(v_i = this.curStroke.length - 2;v_i > 0;v_i -= 2){
			//	this.cxP.lineTo(this.curStroke[v_i] + v_strokeExpand, this.curStroke[v_i + 1] + v_strokeExpand);
			//}
			//this.cxP.fill();
			this.cxP.stroke();
			//this.cxP.stroke();
			//this.cxP.stroke();
			//this.cxP.stroke();
			v_dataP = this.cxP.getImageData(0, 0, this.cvP.width, this.cvP.height);
			for(v_rgbaI = 3;v_rgbaI < this.rgba32BitmapBytes;v_rgbaI += 4){
				if(v_dataP.data[v_rgbaI] > 95){//any pixels with any opacity are set to fully opaque
					v_dataP.data[v_rgbaI] = 255;
				}
			}
			this.cxP.putImageData(v_dataP, 0, 0);
		}*/
		/*
		//OLD CODE: this is laggy and buggy and can make crashes.
		//Sometimes strokes leave gaps between fully opaque pixels so that fills will leak even in contained areas.
		//these gaps may vary by stroke speed direct, or maybe even browser...
		//This code will draw a basic 1px line that guarantees being blocked off with a contiguous fully opaque line from point A to point B
		v_dataP = this.cxP.getImageData(0, 0, this.cvP.width, this.cvP.height);
		for(v_i = 2;v_i < this.curStroke.length;v_i+=2){
			var v_lineX1;
			var v_lineX2;
			var v_lineY1;
			var v_lineY2;
			if(this.curStroke[v_i] > this.curStroke[v_i - 2]){
				v_lineX1 = this.curStroke[v_i - 2];
				v_lineX2 = this.curStroke[v_i];
				v_lineY1 = this.curStroke[v_i - 1];
				v_lineY2 = this.curStroke[v_i + 1];
			}else{
				v_lineX1 = this.curStroke[v_i];
				v_lineX2 = this.curStroke[v_i - 2];
				v_lineY1 = this.curStroke[v_i + 1];
				v_lineY2 = this.curStroke[v_i - 1];
			}
			var v_lineYDirection = v_lineY2 > v_lineY1 ? 1 : -1;
			//v_lineX1 = Math.floor(v_lineX1);
			//v_lineX2 = Math.ceil(v_lineX2);
			/ *if(v_lineYDirection == 1){
				v_lineY1 = Math.floor(v_lineY1);
				v_lineY2 = Math.ceil(v_lineY2);
			}else{
				v_lineY1 = Math.ceil(v_lineY1);
				v_lineY2 = Math.floor(v_lineY2);
			}* /
			/ *v_lineX1 = Math.round(v_lineX1);
			v_lineX2 = Math.round(v_lineX2);
			v_lineY1 = Math.round(v_lineY1);
			v_lineY2 = Math.round(v_lineY2);* /
			var v_lineDX = v_lineX2 - v_lineX1;//x2 - x1
			var v_lineDY = v_lineY2 - v_lineY1;//y2 - y1
			var v_lineDE = Math.abs(v_lineDY / v_lineDX);
			var v_lineE = 0;
			var v_lineY = v_lineY1;//v_lineYDirection == 2 ? Math.floor(v_lineY1) : Math.ceil(v_lineY1);
			var v_XsPerY = (v_lineX2 - v_lineX1) / Math.abs(v_lineY2 - v_lineY1);
			if(v_XsPerY >= 1){
				v_XsPerY = 1;
			}else{//If the line will be taller than it is long, it will need more cycles to make more pixels on different Ys but the same X
				if(v_XsPerY < 0.01){v_XsPerY = 0.01;}//avoid divide by 0 and extremely long cycles
				//v_lineDE *= v_XsPerY;//will only be going a partial part of an X pixel at a time now, so error should account for only the fraction that is moved
			}
			for(var v_lineX = v_lineX1;v_lineX <= v_lineX2;v_lineX += v_XsPerY){
				var v_pIndex = ( Math.round(v_lineY) * this.cvP.width + Math.round(v_lineX) ) * 4;
				v_dataP.data[v_pIndex]     = this.curPaletteColor.r;
				v_dataP.data[v_pIndex + 1] = this.curPaletteColor.g;
				v_dataP.data[v_pIndex + 2] = this.curPaletteColor.b;
				v_dataP.data[v_pIndex + 3] = 255;
				v_lastPix = v_pIndex;
				v_lineE += v_lineDE;
				if(v_lineE >= 0.5){//if error over tolerance, shift y and restart error accumulation.
					v_lineY += v_lineYDirection;
					v_lineE = 0;
				}
			}
		}*/
		//start at [2] it needs too x,y points and will reference [-2, -1]
		/*for(v_i = 2;v_i < this.curStroke.length;v_i+=2){
			var v_pixMoveX = this.curStroke[v_i - 2] - this.curStroke[v_i];
			var v_pixMoveY = this.curStroke[v_i - 1] - this.curStroke[v_i + 1];
			var v_pixMoveAbsX = Math.abs(v_pixMoveX);
			var v_pixMoveAbsY = Math.abs(v_pixMoveY);
			var v_pixStepX;
			var v_pixStepY;
			var v_pixProgX = 0;
			var v_pixProgY = 0;
			//Move at most 1,1 pixels at a time so there are no gaps.
			if(v_pixMoveAbsX > v_pixMoveAbsY){
				v_pixStepX = v_pixMoveAbsX / v_pixMoveAbsY;
				v_pixStepY = 1;
			}else{
				v_pixStepY = v_pixMoveAbsY / v_pixMoveAbsX;
				v_pixStepX = 1;
			}
			var v_pixStepAbsX = v_pixStepX;
			var v_pixStepAbsY = v_pixStepY;
			var v_pixStepSignX = 1;
			var v_pixStepSignY = 1;
			if(v_pixMoveX < 0){v_pixStepSignX = -1;}
			if(v_pixMoveY < 0){v_pixStepSignY = -1;}
			v_pixStepX *= v_pixStepSignX;
			v_pixStepY *= v_pixStepSignY;
			//v_pixStepX /= 8;
			//v_pixStepY /= 8;
			var v_pIndexFF;//Get index with floor ceil combinations
			var v_pIndexFC;
			var v_pIndexCF;
			var v_pIndexCC;
			var v_psX = this.curStroke[v_i - 2];//start on point A [x, y]
			var v_psY = this.curStroke[v_i - 1];
			var v_psMaxX = this.curStroke[v_i];
			var v_psMaxY = this.curStroke[v_i + 1];
			var v_psRevX = false;//v_pixMoveX < 0;//for conditions must be reversed if negative
			var v_psRevY = false;//v_pixMoveY < 0;
			//var v_psDrawX = Math.floor(v_psX);
			//var v_psDrawY = Math.floor(v_psY);
			//var v_psFloorX;
			//var v_psFloorY;
			
			var v_pixMovedAbsX = 0;
			var v_pixMovedAbsY = 0;
			var v_pixMovedNextX = v_pixStepAbsX;//how for it should move before switching to the other coordinate.
			var v_pixMovedNextY = v_pixStepAbsY;
			var v_lastPix = -1;
			while(v_pixMovedAbsX < v_pixMoveAbsX && v_pixMovedAbsY < v_pixMoveAbsY){
				//for(;(v_psRevY? v_psY > v_psMaxY : v_psY < v_psMaxY);v_psY += v_pixStepY){
				for(;v_pixMovedAbsX < v_pixMovedNextX;v_pixMovedAbsX++){
					v_pIndexFF = ( Math.floor(v_psY) * this.cvP.width + Math.floor(v_psX) ) * 4;
					if(v_pIndexFF != v_lastPix){
						v_dataP.data[v_pIndexFF]     = this.curPaletteColor.r;
						v_dataP.data[v_pIndexFF + 1] = this.curPaletteColor.g;
						v_dataP.data[v_pIndexFF + 2] = this.curPaletteColor.b;
						v_dataP.data[v_pIndexFF + 3] = 255;
						v_lastPix = v_pIndexFF;
					}
					v_psX += v_pixStepSignX;
				}
				v_pixMovedNextX += v_pixStepAbsX;
				//for(;(v_psRevX? v_psX > v_psMaxX: v_psX < v_psMaxX);v_psX += v_pixStepX){
				for(;v_pixMovedAbsY < v_pixMovedNextY;v_pixMovedAbsY++){
					v_pIndexFF = ( Math.floor(v_psY) * this.cvP.width + Math.floor(v_psX) ) * 4;
					if(v_pIndexFF != v_lastPix){
					//v_pIndexFC = ( Math.floor(v_psY) * this.cvP.width + Math.ceil(v_psX) ) * 4;
					//v_pIndexCF = ( Math.ceil(v_psY) * this.cvP.width + Math.floor(v_psX) ) * 4;
					//v_pIndexCC = ( Math.ceil(v_psY) * this.cvP.width + Math.ceil(v_psX) ) * 4;
					v_dataP.data[v_pIndexFF]     = this.curPaletteColor.r;
					v_dataP.data[v_pIndexFF + 1] = this.curPaletteColor.g;
					v_dataP.data[v_pIndexFF + 2] = this.curPaletteColor.b;
					v_dataP.data[v_pIndexFF + 3] = 255;//fully opaque to keep wires from leaking
						//If the palette color has partial alpha that will be applied on the final draw, but it needs to be on the bitmap as full opacity.
						//This may look partially transparent palette colors look a bit different on the preview when drawing than they are in the actual image.
					/*    v_dataP.data[v_pIndexFC]     = this.curPaletteColor.r;
					v_dataP.data[v_pIndexFC + 1] = this.curPaletteColor.g;
					v_dataP.data[v_pIndexFC + 2] = this.curPaletteColor.b;
					v_dataP.data[v_pIndexFC + 3] = 255;
					v_dataP.data[v_pIndexCF]     = this.curPaletteColor.r;
					v_dataP.data[v_pIndexCF + 1] = this.curPaletteColor.g;
					v_dataP.data[v_pIndexCF + 2] = this.curPaletteColor.b;
					v_dataP.data[v_pIndexCF + 3] = 255;
					v_dataP.data[v_pIndexCC]     = this.curPaletteColor.r;
					v_dataP.data[v_pIndexCC + 1] = this.curPaletteColor.g;
					v_dataP.data[v_pIndexCC + 2] = this.curPaletteColor.b;
					v_dataP.data[v_pIndexCC + 3] = 255;*    /
					v_lastPix = v_pIndexFF;
					break;
					}//end if moved to a new pixel
					v_psY += v_pixStepSignY;
				}
				v_pixMovedNextY += v_pixStepAbsY;
			}//end while
		}*/
		//this.cxP.putImageData(v_dataP, 0, 0);
		//-----------
		this.cxP.save();
		this.cxP.beginPath();
		this.cxP.lineWidth = this.penWidth;//For some reason .lineWidth is ignored if set before .beginPath()
		this.cxP.strokeStyle = GraFlicImage.getPaletteCSSRGB(this.curPaletteColor);
		if(this.curTool == 300){//Lasso
			if(this.curToolState == 200){
				this.cxP.strokeStyle = 'black';
			}else{
				this.cxP.setLineDash([4, 4]);
				this.cxP.strokeStyle = '#7F7F7F';
			}
		}
		this.cxP.moveTo(this.curStroke[0], this.curStroke[1]);
		for(v_i = 2;v_i < this.curStroke.length;v_i+=2){
			this.cxP.lineTo(this.curStroke[v_i], this.curStroke[v_i + 1]);
		}
		//Do not .closePath() unless drawing a closed shape to connect start/end of line.
		this.cxP.stroke();
		if(this.curTool == 300 && this.curToolState == 200){//If finished and ready to commit, fill it to build the mask.
			this.cxP.fill();
		}
		this.cxP.restore();
	}
	v_dataP = this.cxP.getImageData(rdX1, rdY1, rdW, rdH);//0, 0, this.cvP.width, this.cvP.height);
	if(this.curToolState == 200){
		//If done with current draw, copy to the custom channel system.
		var v_pixA;
		if(this.curTool == 1){
			v_rgbaI = 0;
			chanWI = this.a.f[this.curImage.chan_wi].d;
			chanWA = this.a.f[this.curImage.chan_wa].d;
			chanFI = this.a.f[this.curImage.chan_fi].d;
			//for(v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
			for(h = rdY1;h < rdY2;h++){
			for(w = rdX1;w < rdX2;w++){
				v_copyI = h * canvW + w;
				v_pixA = v_dataP.data[v_rgbaI + 3];//get alpha transparency
				if(this.penWidth >= 2 && this.penWidth < 3){
					if(v_pixA >= v_penOA.full_thresh){
						v_pixA = 255;
					}
				}
				if(v_pixA){//any non-zero value that evals true.
					if(this.curDrawMode){//if DRAWING, not erasing
						/*if(false){//let the existing wire override untying that intersects it
							if(!this.a.f[this.curImage.chan_wi].d[v_copyI]){
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
			this.pushUndoStack();//Save state AFTER stroke committed. An initial push will be made when the file is first started.
			this.requestRedraw(rdX1, rdY2, rdX2, rdY2);//redraw after the stroke has been merged into the channel system.
		}//end pen stroke finished code.
		if(this.curTool == 300 && this.cutBitmap == null){//Committing lasso cut move once finished.
			//For lasso tool, copy anything in the mask to the cut Bitmap.
			//alert('committing lasso cut');
			this.cutBitmap = this.initBitmapWAIFU(true);
			this.cutX = 0;
			this.cutY = 0;
			v_rgbaI = 0;
			for(v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
				v_pixA = v_dataP.data[v_rgbaI + 3];
				if(v_pixA){
					this.a.f[this.cutBitmap.chan_fi].d[v_copyI] = this.a.f[this.curImage.chan_fi].d[v_copyI];
					this.a.f[this.cutBitmap.chan_wi].d[v_copyI] = this.a.f[this.curImage.chan_wi].d[v_copyI];
					this.a.f[this.cutBitmap.chan_wa].d[v_copyI] = this.a.f[this.curImage.chan_wa].d[v_copyI];
					this.a.f[this.curImage.chan_fi].d[v_copyI] = 0;//Now delete the area that was cut out of the source BMP.
					this.a.f[this.curImage.chan_wi].d[v_copyI] = 0;
					this.a.f[this.curImage.chan_wa].d[v_copyI] = 0;
				}
				v_rgbaI += 4;//4 bytes per pixel in the RBBA canvas data
			}
			this.requestRedraw();//The cut adds a bitmap for the cut area, so request a redraw.
		}
		this.curToolState = 0;//set to 0 inactive now that finished with this draw
	}
	
	//Now use the palette indices and alpha values in the custom channel system
	//To draw onto the main viewing canvas.
	var curImageInView = false;//will be set to true when current image is drawn. If the current image is not visible, then a warning indicator will be shown on the current image preview.
	for(var v_bmpI = 0;v_bmpI < v_images2Draw.length;v_bmpI++){//images2Draw objects contain .image with the bitmap and other parameter options
		this.cxB.clearRect(rdX1, rdY1, rdW, rdH);//0, 0, this.cvP.width, this.cvP.height);
		v_rgbaI = 0;
		var v_bmpObj = v_images2Draw[v_bmpI].image;
		var v_onionAlpha = v_images2Draw[v_bmpI].onionAlpha;//Alpha, used for onion skinning.
		if(v_bmpObj.type == 'WAIFU'){//===================================== bitmap ===========================================================
		//console.log('getimagedata ' + rdX1 + ', ' + rdY1 + ', ' + rdW + ', ' + rdH + '...');
		var v_dataB = this.cxB.getImageData(rdX1, rdY1, rdW, rdH);//0, 0, this.cvM.width, this.cvM.height);
			//only get image data for the region being drawn on, to avoid lag.
		//old: for(v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
		chanWI = this.a.f[v_bmpObj.chan_wi].d;//seems to lag when looked up by associative on each iteration
		chanWA = this.a.f[v_bmpObj.chan_wa].d;
		chanFI = this.a.f[v_bmpObj.chan_fi].d;
		//Support drawing only the region that has changed to cut down lag.
		//console.log( (rdX2- rdX1) + ' vs ' + rdW);
		for(h = rdY1;h < rdY2;h++){
		for(w = rdX1;w < rdX2;w++){
			v_copyI = h * canvW + w;
			//Draw the fill channel first, any wire channel filled in will
			//draw over/partially draw over the channel based on the alpha level it has
			var v_fillIndex = chanFI[v_copyI];
			var v_fillPalColor = this.curPalette.colors[v_fillIndex];
			if(v_fillIndex){//if non-zero (index zero is always fully transparent)
				//convert the palette index to RGBA in the canvas
				v_dataB.data[v_rgbaI    ] = v_fillPalColor.r24;
				v_dataB.data[v_rgbaI + 1] = v_fillPalColor.g24;
				v_dataB.data[v_rgbaI + 2] = v_fillPalColor.b24;
				if(v_drawStainedGlass){//v_drawOnion &&   previously was only allowing gem view with onion/ghosting on
					v_dataB.data[v_rgbaI + 3] = Math.round(v_fillPalColor.a24 * 0.25);
				}else{
					v_dataB.data[v_rgbaI + 3] = v_fillPalColor.a24;
				}
			}
			
			var v_wireIndex = chanWI[v_copyI];
			var v_wireAlpha = chanWA[v_copyI];
			//console.log('LCI ' + v_wireIndex);
			if(v_wireIndex){//if non-zero (index zero is always fully transparent)
				//It seems non-rounded float region coordinates were causing undefined errors?
				/*try{
					console.log(v_fillPalColor.a24);
				}catch(er){
					console.log(er + ' i: ' + v_fillIndex + ' at ' + w + ', ' + h)
				}*/
				var v_wirePalColor = this.curPalette.colors[v_wireIndex];
				var v_pixelCurAlpha = v_fillPalColor.a24;//The alpha after fill is drawn.
				//convert the palette index to RGBA in the canvas
				var v_wirePalAlphaOver = v_wireAlpha;//can stay the same if alpha is 255 in wire palette.
				if(v_wirePalColor.a24 < 255){
					//If the palette entry has a non 255 alpha value, that must be factored into the blending.
					v_wirePalAlphaOver = Math.round(v_wireAlpha * v_wirePalColor.a);
				}
				if(v_wireIndex == v_fillIndex){
					//If the wire and the fill are the same color they should combine to one contiguous shape.
					//The fill has not alpha and is just a flat fill, so anywhere the wire intersects a fill with the same color,
					//then it should leave it as is.
				}else{
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
								v_aroundCheckI = v_copyI + this.a.j.save.canvas_width * v_aroundX + v_aroundY;
								v_aroundIndex = v_bmpObj.chan_wi[v_aroundCheckI];
								if( v_aroundIndex &&
								    v_aroundIndex != v_wireIndex
								    && v_bmpObj.chan_wa[v_aroundCheckI] > 127 ){
									v_corIndex = v_aroundIndex;
								}
							}
						}
						var v_corPal = this.curPalette.colors[v_corIndex];
						v_wirePalAlphaOver = 127;
						v_underR = v_corPal.r24;
						v_underG = v_corPal.g24;
						v_underB = v_corPal.b24;
						v_underA = v_corPal.a24 | v_pixelCurAlpha;//If fill underneath(v_pixelCurAlpha) has opacity, do not get rid of that.
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
				}
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
			//this.a.j.save.images[v_bmpI].chan_wi[v_copyI] = 0;
			//this.a.j.save.images[v_bmpI].chan_wa[v_copyI] = 0;
			//this.a.j.save.images[v_bmpI].chan_fi[v_copyI] = 0;
			v_rgbaI += 4;
		}}//end of w and h loops.
		this.cxB.putImageData(v_dataB, rdX1, rdY1);
		this.cxM.save();
		this.cxM.globalAlpha = v_onionAlpha;
		if(v_bmpObj == this.cutBitmap){
			this.cxM.drawImage(this.cvB, this.cutX, this.cutY);
		}else{
			this.cxM.drawImage(this.cvB, rdX1, rdY1, rdW, rdH, rdX1, rdY1, rdW, rdH);
		}
		this.cxM.restore();
			
		}else if(v_bmpObj.type == 'embed'){//===================================== embed ===========================================================
			this.cxM.save();
			this.cxM.globalAlpha = v_onionAlpha;
			this.cxM.drawImage(this.a.f[v_bmpObj.file].i, 0, 0);
			this.cxM.restore();
		}//================================================================================================
		
		if(v_bmpObj == this.curImage && this.canvasPreviewBitmap){//if the preview was configured
			//If this is the current layer, use it to make a thumbnail of current layer being edited.
			v_miniCX = this.canvasPreviewBitmap.getContext('2d');
			v_miniCX.clearRect(rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
			//TODO: make this only copy the updated region to reduce lag.
			v_miniCX.drawImage(this.cvB, rdX1, rdY1, rdW, rdH, rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
			//also draw the preview for things being drawn in real time.
			if(this.curToolState == 100){//preview in progress
				//TODO: make this only copy the updated region to reduce lag.
				v_miniCX.drawImage(this.cvP, rdX1, rdY1, rdW, rdH, rdX1 * v_miniScale, rdY1 * v_miniScale, rdW * v_miniScale, rdH * v_miniScale);
			}
			curImageInView = true;
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
			var v_dataM = this.cxM.getImageData(0, 0, this.cvM.width, this.cvM.height);
			for(v_rgbaI = 0;v_rgbaI < this.rgba32BitmapBytes;v_rgbaI += 4){
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
			this.cxM.putImageData(v_dataM, 0, 0);
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
GraFlicImage.prototype.playNextFrameUnbound = function(){
	if(!this.isPlaying){return;}
	this.playingFrame++;
	if(this.playingFrame >= this.a.j.save.frames.length){this.playingFrame = 0;}
	//Note that 0 is valid for setTimeout. Some frames could have delay of 0 to draw one regional area at the same time as updating a separate regional area and skip the spaces between.
	setTimeout(this.playNextFrame, this.a.j.save.frames[this.playingFrame].delay === undefined ? this.a.j.save.global_delay : this.a.j.save.frames[this.playingFrame].delay);
	this.requestRedraw();
}

GraFlicImage.prototype.bucketFill = function(v_x, v_y){//alert('fillcall');
	if(v_x === undefined){
		//alert(this.fillBucketNextPixels);
		for(var v_key in this.fillBucketNextPixels){
			//grab the first pixel position that comes up and then exit
			var v_keyCoords = v_key.split(/,/);
			//alert('wat');
			v_x = parseInt(v_keyCoords[0]);
			v_y = parseInt(v_keyCoords[1]);
			delete this.fillBucketNextPixels[v_key];
			break;
		}
		//for(v_key in this.fillBucketNextPixels){console.log('has key: ' + v_key);}
		//alert(v_x + ',' + v_y);
		if(v_x === undefined){
			this.curToolState = 200;//finished state so that unneeded draws are not done now that it is finished.
			this.pushUndoStack();
			this.requestRedraw();//Only request redraw AFTER the fill is done. Otherwise, all the draws lag it and slow it down.
			return;//If no more spots left over to finish, exit, it is done.
		}
	}
	this.antiBucketOverload = 0;
	this.curToolState = 100;//Set it to being drawn state so that the visuals get updated.
	//Bucket fills run very slow with associative array key lookups all the time so save a direct link to the current bitmap.
	this.bucketLI = this.a.f[this.curImage.chan_wi].d;
	this.bucketLA = this.a.f[this.curImage.chan_wa].d;
	this.bucketFI = this.a.f[this.curImage.chan_fi].d;
	this.fillRecur(Math.round(v_x), Math.round(v_y), this.cvM.width, this.cvM.height,
		this.curDrawMode ? this.a.j.save.selected_color_index : 0, -1, 0);
				//Always use [0] (reserved transparent) when in erase mode
	//alert('bfdone? ' + v_bfDone);
	setTimeout(this.bucketFillBound, 0);//keep the time small, the issue causing crashes is the number of chained function calls, the call stack.
};
//antiBucketOverload;//Make this global rather than passed recursive, so there is better control of reining in the call stack
		//the call stack size, maximum number of chained function calls, that JS has cannot handle bucket filling.
		//And withe the global, it makes a straighter fill pattern without as many lone pixels that have to be
		//filled individually with a whole timed call.
//fillBucketNextPixels;//when the call stack gets heated, the spots where the fill left off will be saved and continued with timed intervals until the fill is complete
GraFlicImage.prototype.fillRecur = function(v_x, v_y, v_maxX, v_maxY, v_colorToUse, v_color2Replace){
	if(v_x < 0 || v_y < 0 || v_x >= v_maxX || v_y >= v_maxY){
		return;//out of bitmap bounds.
	}
	this.antiBucketOverload++;
	var v_pixI = (v_maxX * v_y + v_x);
	var v_savedForLaterI = v_x + ',' + v_y;//in format '999,999'
	if( v_color2Replace == -1){
		//will start out as -1.
		//If -1, set it to the pixel at this coords, this is where the
		//canvas was clicked!
		if(this.curTool == 2){//fill bucket
			v_color2Replace = this.bucketFI[v_pixI];
		}else if(this.curTool == 3){//wire bucket
			v_color2Replace = this.bucketLI[v_pixI];
		}
		if(v_color2Replace == v_colorToUse){//Trying to color the same color as itself, makes no sense, and will crash.
			return;
		}
	}
		//OLD: * 4;//get the corresponding pixel in RGBA array.
	if(this.curTool == 2){//====================== FILL Bucket ==================
	//ANYTHING under 255 should be filled under. Otherwise it leaves ugly transparent holes
	//that can mess up the Animated PNG compression with unneeded frame region update due to changing trans pixels
	//The wire alpha being zero, and the index being non-zero(anything other than reserved [0] fully transparent)
	//will be considered opaque for the purpose of containing fills within wires. This triggers special handling for wires intersecting off different colors to correct their blending and appearance. That case should be blocked from considered transparent with && !(...)
	if( (this.bucketLA[v_pixI] < 255 && !(!this.bucketLA[v_pixI] && this.bucketLI[v_pixI]) )
	 && this.bucketFI[v_pixI] == v_color2Replace
		){
		if(this.antiBucketOverload > 3000){//if call stack getting overloaded:
			//this.a.f[this.curImage.chan_fi].d[v_pixI] = 3;//trace color to TEST with
			this.fillBucketNextPixels[v_savedForLaterI] = true;//save the pixel spot to be continued with a new call stack.
			//alert ('nextpixval ' + v_savedForLaterI + ': ' + this.fillBucketNextPixels[v_savedForLaterI]);
			return;
		}
		this.bucketFI[v_pixI] = v_colorToUse;
		if(this.bucketLA[v_pixI] < 255){
			//The alpha threshold to keep expanding the fill, is more tight
			//than the alpha threshold to just fill the current pixel and exit.
			//try{
				this.fillRecur(v_x + 1, v_y, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
				this.fillRecur(v_x - 1, v_y, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
				this.fillRecur(v_x, v_y + 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
				this.fillRecur(v_x, v_y - 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
			/*}catch(v_err){//This technique causes the fill pattern to be jagged and inefficient. Setting a reliable overload limit is faster.
				//retry the calls that failed with a new call stack
				this.fillBucketNextPixels[ (v_x + 1) + ',' +  v_y ] = true;
				this.fillBucketNextPixels[ (v_x - 1) + ',' +  v_y ] = true;
				this.fillBucketNextPixels[  v_x      + ',' + (v_y + 1) ] = true;
				this.fillBucketNextPixels[  v_x      + ',' + (v_y - 1) ] = true;
			}*/
		}
	}
	}else if(this.curTool == 3){//====================== LINE Bucket ===================
		if(this.bucketLI[v_pixI] == v_color2Replace){
				// && this.a.f[this.curImage.chan_wa].d[v_pixI]){
				//deleted wire pixels should always be set to reserved transparent [0]
				//that way wires in wire intersect correction mode can be processed here (0 alpha, index non-zero)
				//Filling a wire with reserved [0] transparent will totally erase it.
				//If wanting to fill with transparent wire that can be recolored/replaced, make an extra palette entry with 0 alpha.
			if(this.antiBucketOverload > 3000){//if call stack getting overloaded:
				this.fillBucketNextPixels[v_savedForLaterI] = true;//save the pixel spot to be continued with a new call stack.
				return;
			}
			if(this.curDrawMode){
				this.bucketLI[v_pixI] = v_colorToUse;
			}else{
				this.bucketLI[v_pixI] = 0;
				this.bucketLA[v_pixI] = 0;
			}
			this.fillRecur(v_x + 1, v_y, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
			this.fillRecur(v_x - 1, v_y, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
			this.fillRecur(v_x, v_y + 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
			this.fillRecur(v_x, v_y - 1, v_maxX, v_maxY, v_colorToUse, v_color2Replace);
		}
	}//==========================================================================
	//if got all the way to the end without exiting for overload, delete any saved for later stuff on the pixel and return.
	if(this.fillBucketNextPixels[v_savedForLaterI]){delete this.fillBucketNextPixels[v_savedForLaterI];}
	return;
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
	return [v_x, v_y];
};
GraFlicImage.prototype.mDown = function(v_evt){
	var v_calXY = this.getMouseCalibratedXY(v_evt);
	var v_x = v_calXY[0];
	var v_y = v_calXY[1];
	if(this.curImage.type == 'WAIFU'){
		if((this.curTool == 1 || (this.curTool == 300 && this.cutBitmap == null))){//pen
			//lasso cutter will also use these strokes, but fill between and use it as a mask to cut.
			this.curStroke = [v_x, v_y];
			this.curToolState = 100;
		}
	}//end bitmap
	this.wasX = this.cutX;//may be used for various dragging calculations.
	this.wasY = this.cutY;
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
	
	if(this.isDragging){//========================================================
	this.minRegionX = Math.min(v_x, this.minRegionX);//keep track of what region has been dragged over.
	this.minRegionY = Math.min(v_y, this.minRegionY);
	this.maxRegionX = Math.min(this.a.j.save.canvas_width, Math.max(v_x, this.maxRegionX));
	this.maxRegionY = Math.min(this.a.j.save.canvas_height, Math.max(v_y, this.maxRegionY));
	if(this.curImage.type == 'WAIFU'){
		if((this.curTool == 1 || (this.curTool == 300 && this.cutBitmap == null))&& this.curStroke.length){//pen (do not extent until the wire is started with one x,y coord from mousedown.)
			//cut should only make the stroke if there is no cut BMP yet, otherwise it should drag the existing one.
			var v_prevX = this.curStroke[this.curStroke.length - 2];
			var v_prevY = this.curStroke[this.curStroke.length - 1];
			if(Math.abs(v_x - v_prevX) + Math.abs(v_y - v_prevY) > 2){
				//Do not make a new coord for very short distance,
				//it will all clump together and lose the antialiased effect.
				this.curStroke.push(v_x, v_y);
			}
			//Request redraw only for the region that is being changed.
			//-1 to avoid out of bounds error
			this.requestRedraw(this.minRegionX, this.minRegionY, this.maxRegionX, this.maxRegionY);
		}
		if(this.curTool == 300 && this.isDragging){
			this.cutX = Math.round(this.wasX + v_x - this.dragStartX);
			this.cutY = Math.round(this.wasY + v_y - this.dragStartY);
			//console.log(this.cutX + ', ' + this.cutY)
			this.requestRedraw();
		}
	}//end bitmap
	}//======================= end isDragging ==========================
};
GraFlicImage.prototype.mUp = function(v_evt){
	var v_calXY = this.getMouseCalibratedXY(v_evt);
	var v_x = v_calXY[0];
	var v_y = v_calXY[1];
	if(this.curImage.type == 'WAIFU'){
		if(this.curTool == 1 || (this.curTool == 300 && this.cutBitmap == null)){//pen
			this.curToolState = 200;
			//The redraw MUST be requested on finish, since the drawing code contains the section that commits the final stroke.
			this.requestRedraw(this.minRegionX, this.minRegionY, this.maxRegionX, this.maxRegionY);
		}//end pen
		if(this.curTool == 2 || this.curTool == 3){//bucket
			this.bucketFill(v_x, v_y);
		}
	}//end bitmap
	this.isDragging = false;
};


GraFlicImage.prototype.commitCutMove = function(){
	//This will merge the cut BMP onto the current BMP.
	//If the current bitmap has been changed, note that it is also moved to another layer.
	//if this.cutX this.a.j.save.canvas_height
	var v_srcI;
	for(var v_copyI = 0;v_copyI < this.channelBitmapBytes;v_copyI++){
		v_srcI = v_copyI - this.cutX - Math.round(this.cutY * this.a.j.save.canvas_width);
		//palette indices in the cut bitmap override the current ones
		if(this.a.f[this.cutBitmap.chan_fi].d[v_srcI]){
			this.a.f[this.curImage.chan_fi].d[v_copyI] = this.a.f[this.cutBitmap.chan_fi].d[v_srcI];
			//The following makes a fill on the cut part cover any wires on the destination,
			//this behavior may be overridable in the future.
			this.a.f[this.curImage.chan_wi].d[v_copyI] = 0;
			this.a.f[this.curImage.chan_wa].d[v_copyI] = 0;
		}
		if(this.a.f[this.cutBitmap.chan_wi].d[v_srcI]){
			this.a.f[this.curImage.chan_wi].d[v_copyI] = this.a.f[this.cutBitmap.chan_wi].d[v_srcI];
		}
		this.a.f[this.curImage.chan_wa].d[v_copyI] |= this.a.f[this.cutBitmap.chan_wa].d[v_srcI];
	}
	//Delete virtual files no longer needed to save memory.
	this.a.deleteFile(this.cutBitmap.chan_wi);
	this.a.deleteFile(this.cutBitmap.chan_wa);
	this.a.deleteFile(this.cutBitmap.chan_fi);
	this.a.deleteFile('b/' + this.cutBitmap.id + '/');
	this.cutBitmap = null;//the cutBMP is now empty after it was merged to another bitmap.
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
		v_bJSON.chan_wi = '@z:bitmaps/Wire_I_' + v_i + '.dat.gz';
		v_bJSON.chan_wa = '@z:bitmaps/Wire_A_' + v_i + '.dat.gz';
		v_bJSON.chan_fi = '@z:bitmaps/Fill_I_' + v_i + '.dat.gz';
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
		v_fileEntry.p = 'bitmaps/Line_I_' + v_i + '.dat.gz';
		v_fileEntry.d = window.pako.gzip(v_procBMP.chan_wi, v_pakoDO);
		v_zSave.addFile(v_fileEntry);
		v_fileEntry = {};
		v_fileEntry.p = 'bitmaps/Line_A_' + v_i + '.dat.gz';
		v_fileEntry.d = window.pako.gzip(v_procBMP.chan_wa, v_pakoDO);
		v_zSave.addFile(v_fileEntry);
		v_fileEntry = {};
		v_fileEntry.p = 'bitmaps/Fill_I_' + v_i + '.dat.gz';
		v_fileEntry.d = window.pako.gzip(v_procBMP.chan_fi, v_pakoDO);
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
	this.changeCanvasSize(this.a.j.save.canvas_width, this.a.j.save.canvas_height, 0);
	
	if(this.onLoaded){
		this.onLoaded(this.a);
	}
	//Give embedded images time load after src is set to the blob, then redraw:
	setTimeout(this.requestRedraw, 250);
};



