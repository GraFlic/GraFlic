/*
GraFlicEncoder by Compukaze LLC

Visit

AnimatedPNGs.com
GraFlic.com

Inspired by the Animated PNG/GIF encoder of my Deckromancy.com and Punykura.com projects,
but built in Javascript rather than AS3 and can leverage the native
(and in some cases hardware-accelerated) image encoders of the browser
via Canvas.toDataURL()
It also can make use of the powerful DEFLATE libraries Zopfli and pako for Animated PNG to get optimal results. The browser encoders often build inefficient PNG streams without utilizing PNG modes and features to optimize them, so the use of these libraries is recommended.

Animated PNG export is the main focus for now, since it has hit critical mass on browser support and supporting software. Animated WEBP is also promising, but still not quite there on support/momentum. More formats may be supported later.

=============================================================================
The MIT License (MIT)
Copyright (c) 2013 - 2017 Compukaze LLC
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
=============================================================================

Version 1.1.2 - edit 1

Format support is based on what formats a given browser supports as
an export type from <canvas> .toDataURL()
Takes a list of img/canvas/image URLs
and makes an Animated WEBP or Animated PNG.

Other Animated Formats could potentially be supported in the future,
but Animated PNG and Animated WEBP are the focus for now.
GIF support, for example, would be possible but with Firefox and Safari supporting Animated PNG
and Chrome tentatively adding Animated PNG support by the end of 2016,
GIF support could be pointless in the near future and not the best use of effort right now.
Remember that GIF would need heavy work, like LZW and indexed color selection implementations.

Here is what browsers would currently (early 2017) be capable of supporting
as output (note that Edge and Chrome CANNOT natively PLAY Animated PNG,
but they WILL the first frame or APNG default image):


The status of being able to GENERATE (NOT necessarily VIEW) animated images:

        | Animated PNG  | Animated WEBP
--------+---------------+---------------------------------------------------
Chrome, | Supported.    | Supported.
Opera   |               | 
--------+---------------+---------------------------------------------------
Firefox | Supported.    | Not supported.
        |               | * Firefox is reportedly considering/testing with
        |               |   experimental WEBP support. If it were to support
        |               |   toDataURL('image/webp'), it could work.
--------+---------------+---------------------------------------------------
Safari  | Supported.    | Not supported.
        |               | * Safari has reportedly been considering/testing,
        |               |   WEBP support and if it were to support
        |               |   toDataURL('image/webp'), it could work.
--------+---------------+---------------------------------------------------
Edge    | Supported.    | Not supported.
--------+---------------+---------------------------------------------------
IE      | Supported.    | Not supported.
--------+---------------+---------------------------------------------------
 * IE is being phased out and replaced with Edge.


The status of being able to VIEW animated images:

        | Animated PNG           | Animated WEBP                
--------+------------------------+------------------------------------------
Chrome, | Being tested. Might    | Supported.
Opera   | be finished mid-2017.  |
--------+------------------------+------------------------------------------
Firefox | Supported.             | Not supported.
        |      	                 | * Safari has reportedly been considering/
        |                        |   testing WEBP support. It is unclear if
        |                        |   this includes Animated WEBP or just
        |                        |   non-animated WEBP.
--------+------------------------+------------------------------------------
Safari  | Supported.             | Not Supported.
        |                        | * WEBP reportedly being considered/tested,
        |                        |   but it may only be non-animated for now.
--------+------------------------+------------------------------------------
Edge    | Not supported.         | Not supported.
        | (User only sees first  |
	| frame or default image)|
        | * Marked as under      |
        |   Review on Edge Dev   |
        |   User Voice, but with |
        |   no commitment so far.|
--------+------------------------+------------------------------------------
IE      | Not Supported.         | Not supported.
        | (User only sees first  |
	| frame or default image)|
--------+------------------------+------------------------------------------
 * IE is being phased out and replaced with Edge.


Note that Animated PNG support is possible in all major browsers without the need for a custom DEFLATE implementation
because all major browsers consistently produce RGBA non-interlaced output via toDataURL() in all cases.
It is unclear if this behavior is part of the HTML5 spec or not.
HTML5 does mandate that the image should be able to reproduce all original pixels
exactly, but it is unclear if this means an image with a low number of colors that
could be encoded with 8 bit indexed color is mandated to stay 32 bit RGBA.

However, GraFlicEncoder can be comboed with Zopfli or pako for enhanced compression.

https://github.com/imaya/zopfli.js (The Apache License 2.0)
( ported from https://github.com/google/zopfli )  (The Apache License 2.0)

https://github.com/nodeca/pako/ (MIT License)

It is recommended to include pako even if using only Zopfil because it will enable
much faster scanline filter efficiency tests for faster saves and that does not appear to impact savings.

If the pako script has been included in the page, it will be detected and made use of if possible.
Images that can encode well with indexed PNG8 for additional savings will use pako's deflate()
function to build custom IDAT/fdAT image data streams.

USAGE:
var paramz = {
	"format":'<png|webp>',
	"quality":<0-1> 0% - 100% quality. Lower quality saves more space.
	"delay":<positive integer, 1 or greater>, delay in milliseconds
			(may get limited to 600 on GIF due to browser implementations)
	"width":<uint for pixel dimensions>,
	"height":<uint for pixel dimensions>,
	"autoDimensions":<true|false>, (if true it will fit the size to hold all images added)
	"fitting":<actual|stretch|crop|preserve>,
	"loops":<unsigned integer>,
		A number 0 or more for the number of times the animation should loop.
		0 is infinite. 1 plays once, and so on.
	"generateBase64":<true|false(default)>,
				Current versions of all major browsers now support URL.createObjectURL,
				bypassing the need for expensive / time-consuming creation of a base-64 string,
				although the spec is technically still working - draft.
				.outputBase64 is deprecated and this parameter might be removed later.
				Unless this is set to true,
				.outputBase64 will not be generated, only .output containing a createObjectURL() blob link

	"ppi":<uint for number of pixels per inch>
	"ppm":<uint for number of pixels per metre> ('meter' in the US)
					PNG can use ppi(pixels per inch) or ppm (pixels per metre)
					to create a pHYs chunk that ensures the image can
					be interpreted and/or printed at the desired physical size.
					If you are using ppcm(pixels per centimetre) you can take that
					times 100 to get the ppm.
	"png":<object that can contain PNG-specific parameters for tweaking the features or modes used to encode>
		png.disposePrevious:<true|false>
			Can be set to false to disable dispose to previous mode. Some platforms such as Pebble smartwatch might not support this disposal mode.
			(Probably to save resources by not keeping the previous frame in memory since running on compact hardware.)
		png.disposeBackground:<true|false>
		png.disposeNone:<true|false>
			(Be careful disabling multiple disposal modes, if there are no modes to work with the image cannot be built.)
		png.palette:<Array>
			Up to 256 ARGB numbers representing a preset palette.
			Setting this will force it into indexed mode and skip the color counting step.
			Some hardware like smartwatches might only support certain colors and this can optimize for that.
			Palette is format-specific, for example GIF can only represent RGB colors and one reserved transparent pixel,
			while PNG palette can represent RGBA colors on all entries.
		png.brute:<true|false|1+>
			If true or 1+, brute-force compression will be done.
			Requires zopfli.min.js ( https://github.com/imaya/zopfli.js )
			This takes much longer to complete, but can save allot of size.
			Since reduced quality PNGs have quantization and dithering, and in Animated PNG often lots of repeated transparent pixels over recycled ares,
			it increases repeated patterns and makes brute-force compression more helpful.
			Defaults to false.
			If "brute" is set to a number, it is the number of iterations to go back and fourth to improve LZ77 pattern recycling efficiency in the DEFLATE compression used by PNG.
			Higher numbers can shave off more file size, but take longer and more processing power. Very high numbers can have diminishing returns.
			If set to true, it defaults to 15. 0 will evaluate as false and not use brute-force compression.
			If only Zopfli is included and not pako, it will use the Zopfli brute-force compression regardless of this setting, but the iterations can be configured.
	"dithering":<pattern|none|integer>
		Use patterned dithering or turn dithering off. More modes may be added later. "pattern" is default.
		Dithering is not format-specific, but a technique that can be applied to various formats.
		Integer codes are: 0 = none, 1 = pattern
------------Events----------------------------------------------------
	"onEncoded":<function to call when done>,
	"onProgress":<function to call as encoding progresses. receives a 0-1 number representing a percentage>,
	"onFrameAdded":<function that will get called when a frame image has been fully added, after loading and such>
}
var ae = new GraFlicEncoder(paramz);
	(The parameters can also be changed after initialization by setting ae.width = 500; for example.)
	"fitting" describes how images are fit into the animation bounds.
		'actual' = Draw image at actual size on the canvas at (0,0).
			The image may be cropped,
			or it may not fill the full area.
				('actual' is the default.)
		'stretch' = Stretch the image to fill dimensions.
			it may be skewed.
		'crop' = Make the image fill the canvas, but maintain aspect ratio
			without being skewed.
			The top and bottom may be cropped,
			or the left and right may be cropped.
			it will be centered either way.
		'preserve' = preserves all areas of all images and all aspect ratios of all images.
f = {
	"file":<[Object File]> OR "image":<[Object Image]>
	<more optional parameters will be added later>
};
ae.addFrame(f);
	(repeat this several times)
ae.saveAnimatedFile();
function onEncodedFunc(ae){
	//Finally set the image src and href to the Object URL of the animated image.
	//.output will contain the viewable/downloadable image link that can be used by src, href, etc.
	//.output is currently a blob reference created by URL.createObjectURL() and will probably always as stay that.
	//The createObjectURL blob link can be created instantly once the binary data is all there, cutting encoding time greatly. 
	anImage.src = ae.output;
	anImage.href = ae.output;
	anImage.download = 'filename_that_your_image_should_have.' + ae.format;//This is optional. It gives a meaningful filename when saved.
}
----------ADVANCED--------------------------------
	"metadata":<array of metadata items|false>
		An array of strings to be included as metadata. Objects for advanced meta may be added later.
		Set to boolean false to discard metadata and shave off bytes.
		Simple "key":"string" metadata items should be recorded in the most basic and standard way possible.
		For example, PNG stores basic things like "Author" in a tEXt chunk(ASCII) or iTXt chunk(UTF-8).
		For WEBP, the most basic place to store something might be in EXIF tags.
		TODO: Handle EXIF keys like "0x013B" or "Exif.image.Artist"
			(Might need to convert from PNG equivalent "Author")
		TODO: Standard way to take XMP and put it into whatever place can hold it with the current format.
	"locale":<string>
		A standard locale string like 'en-US' for the language of the image. This may be used by "metadata".
		(Only a single locale is supported, writing metadata for multiple locales is allot of bloat and would be rarely used.)
	"retainPastOutput":<true|false>, (default is not set, evaluates false)
		//By default, output is only retained until saveAnimatedFile is run again.
		//If retainPastOutput is set to true, it will be up to the software using the GraFlicEncoder class
		//to do memory management and decide when to revoke ObjectURLs that are no longer needed.
		//AE by default assumes that if you are re-encoding the image, you are redoing the same image
		//with different parameters and discards the previous blob file to prevent huge memory leaks.
		//If making multiple images and wanting the output to stay downloadable/saveable for all images,
		//set retainPastOutput = true or make multiple GraFlicEncoder() instances.

	********** The following will be set internally and do *******
	*************** NOT need to be set in paramz *****************
	"frames":<frame setups>
	"payloads":<will store the bitstreams of extracted frames to build from>
	"sourceFormat":<png|gif|webp> (The format that the encodings will be extracted from based on the browser's supported Canvas.toDataURL() encodings. Internally set based on format. For all currently supported types, this will be the same as format.)
	**************************************************************

NOTE: Browsers may consider accessing the contents of images not on the same domain a security risk and may scream about 'security' or a 'tainted' canvas in browser console.
This can be an issue when testing things locally from your computer files and folders.
You can mostly get around this by disabling CORS restrictions on your browser while testing your code locally.
In most cases your website is not going to need the cross-domain images and it will not be a problem once live on your site,
but the Cross-Origin Resource Sharing rules can create huge headaches when testing your code locally.

*/
'use strict';
function GraFlicEncoder(paramz,simpleQuality){
	if(paramz == 'webp'//only webp is implemented so far
	 ||paramz == 'png'
	 ||paramz == 'gif'
	 ||paramz == 'webm'){
		//type checking in Javascript is weird, so this will be more reliable
		//if called with an unsupported string it could break,
		//but that is not a valid value to call it with
		//Valid initialization values are:
//new GraFlicEncoder('webp'|'webm'|'png'|'gif'|Object)
		paramz = {
				"format":paramz
			};
		if(simpleQuality!==undefined){
			paramz.quality = simpleQuality;
		}
	}
	//set up defaults
	this.format = 'png';//Canvas.toDataURL('image/png'); supported in all browsers, so this is default.
	this.quality = '0.75';
	this.outputWidth = 1;
	this.outputHeight = 1;
	this.delay = 75;//The in milliseconds delay for all frames, unless frame-specific delay set.
	this.onEncoded = null;
	this.fitting = 'actual';
	this.dithering = 'pattern';
	this.loops = 0;
	
	this.generateBase64 = false;//Set to true for legacy support. Deprecated. This may be removed later.
	
	
	//following values should not be overridden:
	this.outputBase64 = null;
	this.outputOctetStream = null;
	this.output = null;
	this.frames = [];
	this.chunkPackI = 0;
	
	for(var key in paramz){
		this[key] = paramz[key];
	}
	
	this.encoderCanvas = document.createElement('canvas');
};
GraFlicEncoder.prototype.supportsFormat = function(desiredFormat){
	//This means the animated format can be created in the user's current browser.
	//It does not always mean that browser can display the animation.
	desiredFormat = desiredFormat.toLowerCase();
	if(desiredFormat=='png'){
		return true;//HTML5 spec calls for canvas.toDataURL to always support PNG.
	}
	//===============these types are supported if .toDataURL() support is there:=============
	if(desiredFormat=='webp'){//check list of types(currently just WEBP)
		//Otherwise, check to see if it worked or defaulted to PNG.
		//If it did not default to PNG due to unsupported type, return true.
		var canv = document.createElement('canvas');
		canv.width = 1;canv.height = 1;
		if(canv.toDataURL('image/'+desiredFormat).substring(0,15)=='data:image/png;'){
			return false;
		}
		return true;
	}//===========end of types that are supported if toDataURL is available for them.========
	return false;
};
GraFlicEncoder.prototype.clearFrames = function(){
	//A standard function for clearing frames. Will look cleaner for developers.
	this.frames = [];
};
/*
Animated WEBP:
(made of RIFF chinks (FourCC,))
(note that WEBP integers are unsigned LITTLE ENDIAN)
RIFF/WEBP header
contents{
	VP8X chunk
	ANIM chunk (global animation paramz)
	ANMF (frame1 paramz and data)
	ANMF (frame2 paramz and data)
	...
	ANMF (frameX paramz and data)
}
*/
GraFlicEncoder.prototype.addFrame = function(frameParamz){
	/*a frame can be added 3 different ways.
	only ONE of these should be set
	{"image":[Object IMG]}
		creates frame from active <img> element, which can be access by
		creating it with document.createElement('img')
		OR locating it with document.getElementById('img_id')
	{"file":[Object File]}
		A file selected by a <input type="file" accept="image/*"> element.
		this.files[0] can access the file for a simple single selector
		from within 'onChange' for the input.
		This is a MODERN HTML input technique that works locally and
		DOES NOT REQUIRE SERVER-SIDE INTERACTION
	
	{"url":[String to be used as 'src']}
	*/
	var this_this = this;
	//since a zero-length frame might be something some format supports at some point,
	//auto detect and set custom delay to true if any delay parameter is set.
	/*
	//depending on ===undefined is confusing and might be unreliable
	frameParamz.hasCustomDelay = false;
	for(var key in frameParamz){
		if(key=='delay'){
			frameParamz.hasCustomDelay = true;
		}
	}//acutlally === undefined seems fine
	*/
	if(frameParamz.image){
		this.addFrameFromImage(frameParamz);
	}else if(frameParamz.file){
		//if input is not from <img>, an image must be generated first.
		
		this.imageLoading = document.createElement('img');
		frameParamz.image = this.imageLoading;
		this.frameLoadingParamz = frameParamz;
		this.imageLoadingFunc = GraFlicEncoder_frameImageLoading.bind(this);
		this.imageLoading.addEventListener('load', this.imageLoadingFunc);
		
		this.fileReading = new FileReader();
		this.fileReadingFunc = GraFlicEncoder_frameFileReading.bind(this);
		this.fileReading.addEventListener('load', this.fileReadingFunc);
		this.fileReading.readAsDataURL(frameParamz.file);
	}else if(frameParamz.url){
		this.imageLoading = document.createElement('img');
		frameParamz.image = this.imageLoading;
		this.frameLoadingParamz = frameParamz;
		this.imageLoadingFunc = GraFlicEncoder_frameImageLoading.bind(this);
		this.imageLoading.addEventListener('load', this.imageLoadingFunc);
		this.imageLoading.src = frameParamz.url;
	}
};
function GraFlicEncoder_frameFileReading(aeEvent){
	this.fileReading.removeEventListener('load', this.fileReadingFunc);
	this.imageLoading.src = this.fileReading.result;
	delete this.fileReading;
	delete this.fileReadingFunc;
}
function GraFlicEncoder_frameImageLoading(aeEvent){
	this.imageLoading.removeEventListener('load', this.imageLoadingFunc);
	this.addFrameFromImage(this.frameLoadingParamz);
	delete this.frameLoadingParamz;
	delete this.imageLoading;
	delete this.imageLoadingFunc;
}
GraFlicEncoder.prototype.addFrameFromImage = function(frameParamz){
	//frames should be added, then processing will be done afterwards.
	this.frames.push(frameParamz);
	//alert('frame added, now there are '+this.frames.length+' f.image: '+frameParamz.image);
	if(this.onFrameAdded){this.onFrameAdded();}
};
GraFlicEncoder.prototype.procFrame = function(){
	var this_this = this;//works around access bugs with 'this'
	var curFrame = this.frames[this.frameBeingProcessed];
	var frameImg = curFrame.image;
	this.encoderCanvas.width = this.outputWidth;
	this.encoderCanvas.height = this.outputHeight;
	var ctx = this.encoderCanvas.getContext('2d');
	ctx.save();//save context state before potentially transforming
	var scX = 1;//scaling
	var scY = 1;
	var trX = 0;//translation vars
	var trY = 0;
	if(this.fitting == 'stretch'){
		scX = this.outputWidth/frameImg.naturalWidth;
		scY = this.outputHeight/frameImg.naturalHeight;
		ctx.scale(scX,scY);
	}
	if(this.fitting == 'crop'){
		scX = this.outputWidth/frameImg.naturalWidth;
		scY = this.outputHeight/frameImg.naturalHeight;
		if(scX<scY){
			scX = scY;
			trX = -(frameImg.naturalWidth*scY-this.outputWidth)/2;
		}else{
			scY = scX;
			trY = -(frameImg.naturalHeight*scX-this.outputHeight)/2;
		}
		ctx.translate(trX,trY);
		ctx.scale(scX,scY);
	}
	if(this.fitting == 'preserve'){//preserves all areas of all images and all aspect ratios of all images.
		scX = this.outputWidth/frameImg.naturalWidth;
		scY = this.outputHeight/frameImg.naturalHeight;
		if(scX>scY){//currently the same logic as 'crop' completely, except this reversed condition.
			scX = scY;
			trX = -(frameImg.naturalWidth*scY-this.outputWidth)/2;
		}else{
			scY = scX;
			trY = -(frameImg.naturalHeight*scX-this.outputHeight)/2;
		}
		ctx.translate(trX,trY);
		ctx.scale(scX,scY);
	}
	ctx.drawImage(frameImg,0,0);
	ctx.restore();//return context to default state with no transforms
	//alert('quality: '+this.quality);
	var i;//used in various loops.
	var chanI;//Cycle thru channels for multi-byte modes.
	var w, h;
	
	//these dimensions may be updated if only  a smaller section of the image has updates on it.
	var frameFinalX = 0;//TODO, scrunch the frame down to only the region that is updated.
	var frameFinalY = 0;
	var frameFinalW = this.outputWidth;
	var frameFinalH = this.outputHeight;
	//TODO: Frame removal and make previous frame last longer if no changes.
	//for testing of inter-frame and such:
		//if(!this.encoderCanvas.parentNode){document.getElementsByTagName('body')[0].appendChild(this.encoderCanvas);}
	//TODO: Put inter-frame pixel recycling and quantization here.
	var browserEncodedBlending = 1;//1 is Over
	if(this.format=='png'||this.format=='gif'){//Inter-frame pixel recycling. Only PNG uses this currently. GIF will.
		var fRGBA = ctx.getImageData(0,0,this.encoderCanvas.width,this.encoderCanvas.height);
		if(this.procFrameStage == 0){//================ 0 for final ============================
		//Canvas ImageData is in RGBA format(not ARGB).
		if(!this.customByteStream){//If extracting from the browser's toDataURL() encoder.
		//The browser-powered non-custom byte stream mode only has basic functionality.
		//Since the browser-powered mode is incapable of full optimization, it is kept simple, and the custom byteStream mode is recommended instead.
		//Palette has its own quantization via converting to indexed color table. And uses a different style of dithering.
		var needsReset = true;//must set it up if not looped at least once.
		while(needsReset){//-------------------------------------------------
		needsReset = false;
		this.buildDithMasks();//must have masks before quantizing
		this.quant8Octets(fRGBA.data);
		if(this.frameBeingProcessed>0){
			for(i=0;i<fRGBA.data.length;i+=4){
				//If the pixel is the same as previous frame, recycle it by drawing nothing over it.
				if( browserEncodedBlending //If not source mode(0), but using Over mode(1), pixels can be recycled.
				 && fRGBA.data[i]   == this.nRGBA.data[i]
				 && fRGBA.data[i+1] == this.nRGBA.data[i+1]
				 && fRGBA.data[i+2] == this.nRGBA.data[i+2]
				 && fRGBA.data[i+3] == this.nRGBA.data[i+3]
				   ){
					fRGBA.data[i]   = 0x00;
					fRGBA.data[i+1] = 0x00;
					fRGBA.data[i+2] = 0x00;
					fRGBA.data[i+3] = 0x00;
				}else{//Otherwise, draw it on the previous ImageData to be compared next frame.
					if(browserEncodedBlending && this.nRGBA.data[i + 3] && fRGBA.data[i + 3] < 0xFF){
						//Over blending cannot overwrite pixels that have opacity with pixels that have transparency.
						browserEncodedBlending = 0;//Switch to Source blending mode and restart the loop.
						needsReset = true;
						fRGBA = ctx.getImageData(0,0,this.encoderCanvas.width,this.encoderCanvas.height);//Reset the data.
						break;
					}
					//Source mode will set all of the disposal buffer data to the data being written anyways,
					//so this does not create a problem when resetting and switching you source mode.
					this.nRGBA.data[i]   = fRGBA.data[i];
					this.nRGBA.data[i+1] = fRGBA.data[i+1];
					this.nRGBA.data[i+2] = fRGBA.data[i+2];
					this.nRGBA.data[i+3] = fRGBA.data[i+3];
				}
			}
		}else{
			this.nRGBA = fRGBA;//If the first frame, just save the state of it for the next frame to compare.
			//TODO: make it a plain array so that pre multiplying cannot mess with it?
		}
		}//---------- end reset and revert to Source-mode loop --------------------
		ctx.putImageData(fRGBA,0,0);
		}//=================== end not palette ===================
		}else if(this.procFrameStage == 100){//end if final stage
			//====================== if stage 100, color count ======================
			//This will count all of the colors for all frames before processing the frames,
			//so that all frames use the same color frequency data.
			for(i=0;i<fRGBA.data.length;i+=4){
				this.incrementColorCount(fRGBA.data[i], fRGBA.data[i + 1], fRGBA.data[i + 2], fRGBA.data[i + 3]);
			}
			
			//alert(this.uniqueColors + ' colors');
			//alert(this.sigColors + ' significant colors');
			this.frameBeingProcessed++;
			if(this.frameBeingProcessed == this.frames.length){//If the last frame has been color counted.
				this.frameBeingProcessed = 0;
				this.procFrameStage = 0;//set stage to 0, final, so that it can draw and encode the image now that it has the color count.
				//Once the colors have been analyzed, determine what type of byte stream it will use,
				//32-bit RGBA, 8-bit indexed, or 24-bit RGB with one RGB value reserved as the simple transparency code.
				//48-bit and 64-bit modes are not currently supported. Canvas has no support for deep color and screens that can even display it are extremely rare.
				this.customByteStream = false;//whether to build the byte stream or use the toDataURL byte stream from the browser.
				this.byteStreamMode = 4;
					//byteStreamMode (for PNG) values are:
					//	1 = 1-byte indexed color
					//	3 = 3-byte RGB color with only simple transparency(reserved color)
					//	4 = 4-byte RGBA color
				this.hasTransparency = 0;
					//0 = no transparency
					//1 = has only simple transparency(fully transparent pixels)
					//2 = has transparency including semi-transparent pixels.
				//Let it go into 24-bit mode if it has transparency but only completely transparent transparency.
				for(var opacityLevel in this.colorLookup){//[alpha] is first in [a][r][g][b]
					if(opacityLevel < 255){
						//If there are any non-opaque pixels in the animation, the 32-bit or 8-bit PNG must be used.
						//Otherwise, use 24-bit or 8-bit since no alpha channel is needed.
						//(note that color count is done before transparent pixels are inserted to recycle previous values)
						if(opacityLevel == 0){
							this.hasTransparency = Math.max(1, this.hasTransparency);
						}else{
							this.hasTransparency = 2;
						}
					}
				}
					
				//customByteStream cannot be used without a DEFLATE compressor
				//if the Zopfli or pako deflate library is not present, 32-bit RGBA is the only option.
				if(window.pako || window.Zopfli){
					this.customByteStream = true;
					if(this.hasTransparency < 2){
						//If no transparency, and not using a palette, use(will be switched to mode 1 indexed if a palette is used.)
						this.byteStreamMode = 3;
					}
					//If the Zopfli or Pako deflate library exists in the page, it can be used to create PNG8 (toDataURL() currently always PNG32 RGBA)
					//for low quality settings, always force indexed PNG8
					if(this.quality <= 0.5){
						this.paletteLimit = Math.round(512 * this.quality);
						if(this.paletteLimit < 13){
							this.paletteLimit = 13;//Enough for 12 colors and transparent pixel.
						}
					}else if(this.quality <= 0.75){
						//for higher-quality settings only switch to palette if
						//the number of colors is not too high and it can handle
						//the image without unacceptable quality loss.
						if(this.sigColors <= 350 * (0.75 / this.quality) ){//Raise the maximum significant count for lower levels of quality
							//.sigColors count is an estimation not exact.
							//It needs to determine if it in general has too many colors for a palette to handle.
							this.paletteLimit = 256;
						}
					}else{
						//For quality over 75%, only go indexed if there are literally only 256 colors or less
						//(the transparent pixel for recycling will take up an extra slot
						//if transparent pixel did not appear in the original image)
						if(this.uniqueColors <= 255 //Only 255 colors, an extra slot available for fully transparent pixel.
						 || (   this.uniqueColors <= 256 //Only 256 colors, and fully transparent is one of them.
						     && this.getColorCount(0, 0, 0, 0) ) ){
							this.paletteLimit = 256;
						}
					}
				}//========================== end if has PNG8 capability ============================
				//alert('palette limit: ' + this.paletteLimit);
				if(this.paletteLimit){//========== if using palette =================================
				this.byteStreamMode = 1;
				//Now that color counting has been done, build the palette.
				
				var includeThresh = this.significantThresh * 0.025;//Threshold to include as a candidate for the palette.
				var sortThresh = this.significantThresh * 0.25;//Threshold to sort a color that looks to be common
				//Limit these based on the number of significant colors calculated to keep it from having extreme lag
				//from doing checks on colors that are very unlikely to meet the requirements to be included in the palette.
				
				//Force it to be kept if it represents a large portion of the image.
				//This will stop colors that are close, but still represent large parts of the image from being eliminated.
				var keepThresh = this.outputWidth * this.outputHeight * this.frames.length * (1/this.paletteLimit);
				//The keep threshold should not bee too high or things like gradients can hog all the palette with shades of colors
				//that are semi-common but not the ones that should be selected.
				
				
				/*if(this.outputWidth * this.outputHeight < 0x3FFF){
					//Exception for small images (< 128 x 128)
					includeThresh = 1;
					sortThresh = 2;
				}*/
				this.palette = [];
				this.paletteExactMatch = [];//Used to quickly detect an exact match in the palette and reject quantization overflow
				//Insert 0 with a maxed out count, some movie type animations are omitting the transparent
				//value from the palette. Since the transparent pixel is so essential,
				//it can be forced if there is animation.
				//(Remember the color count is done before transparent pixels are inserted to eliminate duplicates between frames.)
				var paletteCandidates  = [0x00000000];
				var paletteColorCounts = [0x7FFFFFFF];
				if(this.frames.length < 2){//If no animation, do not force the transparent pixel.
					paletteCandidates.pop();
					paletteColorCounts.pop();
				}
				var palA, palR, palG, palB;
						for(var aI in this.colorLookup){
						for(var rI in this.colorLookup[aI]){
						for(var gI in this.colorLookup[aI][rI]){
						for(var bI in this.colorLookup[aI][rI][gI]){
								if(this.colorLookup[aI][rI][gI][bI] >= includeThresh){//paletteCandidates.length < 256){
									if(this.colorLookup[aI][rI][gI][bI] > sortThresh){
										//Do not waste big resources on of looping to find the right ordered spot for
										//very low occurring things, just throw them on the bottom of the list.
										for(i = 0;i < paletteCandidates.length;i++){
											if( this.colorLookup[aI][rI][gI][bI] > paletteColorCounts[i - 1]){
												break;
											}
										}
									}else{
										i = paletteCandidates.length;
									}
									//Insert it just below anything that outranks it in usage.
									paletteCandidates.splice(i, 0,
										aI << 24 | rI << 16 | gI << 8 | bI
									);
									paletteColorCounts.splice(i, 0,
										this.colorLookup[aI][rI][gI][bI]
									);
								}
						}}}}
				//alert(paletteCandidates.length + ' palette candidates over simple threshold');
				
				
				
				var zDif = 1;//range to zero out around it
				while(paletteCandidates.length > this.paletteLimit && zDif <= 128){
				
				for(i = 0;i < paletteCandidates.length;i++){
					var palClr = paletteCandidates[i];
					    palA = palClr >> 24 & 0xFF,
					    palR = palClr >> 16 & 0xFF,
					    palG = palClr >> 8 & 0xFF,
					    palB = palClr & 0xFF;
					var zMinA = Math.max(0, palA - zDif),
					    zMinR = Math.max(0, palR - zDif),
					    zMinG = Math.max(0, palG - zDif),
					    zMinB = Math.max(0, palB - zDif),
					    zMaxA = Math.min(256, palA + zDif),
					    zMaxR = Math.min(256, palR + zDif),
					    zMaxG = Math.min(256, palG + zDif),
					    zMaxB = Math.min(256, palB + zDif);
					//Seek ahead and elliminate colors that are too close to something already there,
					//and would be too indistinguishable to the eye to be helpful.
					for(var ellimI = i + 1;ellimI < paletteCandidates.length;ellimI++){
						var ellimA = paletteCandidates[ellimI] >> 24 & 0xFF,
						    ellimR = paletteCandidates[ellimI] >> 16 & 0xFF,
						    ellimG = paletteCandidates[ellimI] >> 8  & 0xFF,
						    ellimB = paletteCandidates[ellimI]       & 0xFF;
						
						if(   ellimA >= zMinA && ellimA <= zMaxA
						   && ellimR >= zMinR && ellimR <= zMaxR
						   && ellimG >= zMinG && ellimG <= zMaxG
						   && ellimB >= zMinB && ellimB <= zMaxB ){
							if(paletteColorCounts[ellimI] < keepThresh){
								paletteCandidates.splice(ellimI, 1);
								paletteColorCounts.splice(ellimI, 1);
								ellimI--;
							}
							if(paletteCandidates.length <= this.paletteLimit){
								break;
							}
						}
					}
					if(paletteCandidates.length <= this.paletteLimit){break;}
				}
					//if(zDif < 8){
						zDif++;
					//}else{
					//	zDif *= 2;
					//}
					if(paletteCandidates.length <= this.paletteLimit){break;}
				}//end while
				//alert(paletteCandidates.length + ' palette candidates after eliminating similar');
				for(i=0;i < this.paletteLimit && i < paletteCandidates.length;i++){
					palA = paletteCandidates[i] >> 24 & 0xFF;
					palR = paletteCandidates[i] >> 16 & 0xFF;
					palG = paletteCandidates[i] >> 8 & 0xFF;
					palB = paletteCandidates[i] & 0xFF;
					//The lowest numbered palette indices have the most occurrences.
					this.palette.push(paletteCandidates[i]);
					//track exact matches
					if(this.paletteExactMatch[palA] === undefined){//(0 would be valid)
						this.paletteExactMatch[palA] = [];
					}
					if(this.paletteExactMatch[palA][palR] === undefined){
						this.paletteExactMatch[palA][palR] = [];
					}
					if(this.paletteExactMatch[palA][palR][palG] === undefined){
						this.paletteExactMatch[palA][palR][palG] = [];
					}
					this.paletteExactMatch[palA][palR][palG][palB] = true;
					if(palA == 0){this.paletteTransI = i;}//Track the index to the fully transparent pixel.
				}
				//alert('palette size: ' + this.palette.length);
				}else{//==== end if using palette ======================================
					if(this.byteStreamMode == 3){
						this.reservedTransColor = [-1, -1, -1];
							//All negatives so that it will never evaluate as matching transparent if 24-bit with no tRNS.
						if(this.hasTransparency || this.frames.length > 1){//Will need transparent for recycling if multi-frame.
							this.reservedTransColor = [127,127,127];//Default if no unused colors found. (unlikely)
							//Find color that is not used, and that pixels will not be quantized to.
							i = 0;
							var resIncr = 1;
							if(this.quality < 1){
								//Start on an odd, and stay odd because no quantized increments have the low bit 00000001 set.
								//This helps prevent a conflict with a color that something gets quantized to.
								i = 1;resIncr = 2;
							}//(For unquantized any color is as likely to work.)
							for(;i < 0xFFFFFF;i += resIncr){
								var resR = i >> 16 & 0xFF, resG = i >> 8 & 0xFF, resB = i & 0xFF;
								if(!this.getColorCount(resR, resG, resB, 0xFF)){
									this.reservedTransColor = [resR, resG, resB];
									break;
								}
							}
						}
					}
				}//======== End if not using palette ===================================
				
				this.initBuffersPNG();
				//alert('bystSMode ' + this.byteStreamMode);
			}//================== end if last frame for color count ===================
			setTimeout(function(){this_this.procFrame();},50);
			if(this.onProgress){
				this.progress += this.progressPerFrame;
				this.onProgress(this.progress);
			}
			return;//Exit here. This is a pre-processing stage that just counts the colors.
		}
	}
	
	
	//must strip:
	//data:image/png;base64, (22)
	//data:image/webp;base64, (23)
	
	var datB64;
	var raw8;
	var upd8;
	var frameDelay = this.delay;//delay in milliseconds
	//(remember, 0 delay may be valid so simple ! will not work)
	if(curFrame.delay !== undefined){frameDelay=curFrame.delay;}//use frame-specific delay if set.
	//for(i=0;i<upd8.length;i++){
	//	upd8[i] = 0x50;//fill with 'P' to see if there are errors writing when viewed from text editor.
	//}
	var upd8_pos = 0;//this will keep track of how large
		//the final frame section will be
		//(fcTL chunk, IDAT/fdAT series of IDATs/fdATs)
	//upd8 will hold the updated
	//it must be able to hold extra bytes because fdAT chunks have
	//the FrameSequenceCount added to the front of the data payload
	//alert('dat8 len: '+raw8.length);
	//alert('dat8: '+String.fromCharCode.apply(null,raw8));
	var chunkSig;//aka 'FourCC'
	var chunkLen;
	var seekPos = 0;
	
	//########################### PNG ########################
	/*
	this.nRGBA is the animation buffer for no disposal (code 0)
	this.pRGBA is the animation buffer for return to previous (code 2)
	both of these should be attempted and whichever one is optimal will be selected for the
	disposal method of the previous frame after drawing the current frame on both of them
	In some cases dispose to transparent black (code 1) might also be optimal
	(not yet implemented for non-custom byte stream mode)
	*/
	if(this.sourceFormat=='png'){
	if(this.customByteStream){
							//(+1 for scanline filter mode)
		//alert(frameFinalW + ' * ' + frameFinalH + ' + ' + frameFinalH + ' = ' + (frameFinalW * frameFinalH + frameFinalH) );
		//var index8 = new Uint8Array(new ArrayBuffer(byteBufLength));
		//alert('index8 init length ' + index8.length);
		var fRGBA = ctx.getImageData(0,0,this.encoderCanvas.width,this.encoderCanvas.height);
		var qData = null;//was experimental//var qData = new Int16Array(new ArrayBuffer(fRGBA.data.length * 2));//Will hold quantization errors distributed from nearby pixels.
			//The are stored in this separate array so that exact match pixels can reject them.
			//Quant overflow can be negative, and must hold at least a byte AND a sign (Array buffer length is bytes, so * 2 length if 16-bit)
		var indexPos = 0;
		//var pixelI = 0;
		//find the rectangular region that contains all changes.
		var minNOX = this.outputWidth, minNOY = this.outputHeight, maxNOX = 0, maxNOY = 0,//None-Over
		    minPOX = this.outputWidth, minPOY = this.outputHeight, maxPOX = 0, maxPOY = 0,//Prev-Over
		    minTOX = this.outputWidth, minTOY = this.outputHeight, maxTOX = 0, maxTOY = 0,//Tran-Over
		    minNSX = this.outputWidth, minNSY = this.outputHeight, maxNSX = 0, maxNSY = 0,//None-Source
		    minPSX = this.outputWidth, minPSY = this.outputHeight, maxPSX = 0, maxPSY = 0,//Prev-Source
		    minTSX = this.outputWidth, minTSY = this.outputHeight, maxTSX = 0, maxTSY = 0,//Tran-Source
		    canNO = true, canPO = true, canTO = true, canNS = true, canPS = true, canTS = true;
		//the can- booleans will be set to false if a possibility is eliminated and processing does not need to
		//be done for it for the remainder of the frame.
			//Remember Tran-Source and Tran-Over CAN have different results because the region of the previous frame that
			//got cleared to transparent black may not cover the whole area that updates.
		if(this.frameBeingProcessed == 0){
			canNO = false;canPO = false;canTO = false;canNS = false;canPS = false;//Clear all but canTS.(no prior existing data on first frame)
		}else if(!this.hasTransparency){
			canTO = false;canTS = false;//No advantage of disposing to transparent in an image with no transparency.
			//(but Tran-Source will always be used on the first frame which has no prior data available.)
		}
		if(this.frameBeingProcessed == 1){
			canPO = false;canPS = false;//The second frame before cannot dispose to previous with no frame before it.
		}
		if(this.pngOpts){
			//If tweaked to disable certain dispose modes.
			//(Be careful disabling multiple modes, if there are no modes to work with the image cannot be built.)
			if(!this.pngOpts.disposeNone){
				canNO = false;canNS = false;
			}
			if(!this.pngOpts.disposePrevious){
				canPO = false;canPS = false;
			}
			if(!this.pngOpts.disposeBackground && this.frameBeingProcessed > 0){
				//Image will ALWAYS initialize to transparent black before the first frame.
				canTO = false;canTS = false;
			}
		}
		if(this.byteStreamMode >= 3){
			this.buildDithMasks();//must have masks before quantizing
			this.quant8Octets(fRGBA.data);
		}
		var bufI;
		for(h = 0;h < this.outputHeight;h++){
		for(w = 0;w < this.outputWidth;w++){
			bufI = (w + h * this.outputWidth);
			i = bufI * 4;//Aligns with the canvas getImageData.
			bufI *= this.byteStreamMode;//Aligns with the byte stream for the active mode.
			var pixHasAlpha;
			//==================================== 8-bit indexed =====================================
			if(this.byteStreamMode == 1){
				var palIndex = this.getPaletteIndex(fRGBA.data, qData, i, w, h);
					//The alpha must be extracted. 0xFF000000 cannot be used because JS numbers are signed and will flow into negative.
				pixHasAlpha = (this.palette[palIndex] >> 24 & 0xFF) < 0xFF;
					//The boolean < will eat part of the boolean extraction operation if not put in ( )
				if( (canPS || canPO) ){
					if(this.bufPrev[bufI] != palIndex){
						if(canPO){
							//The boolean if will eat part of the boolean operation if not put in ( )
							if(pixHasAlpha && (this.palette[this.bufPrev[bufI]] >> 24 & 0xFF) > 0){
								//If overwriting a pixel that has opacity with one that has transparency.
								canPO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minPOX = Math.min(w, minPOX);
							minPOY = Math.min(h, minPOY);
							maxPOX = Math.max(w, maxPOX);
							maxPOY = Math.max(h, maxPOY);
							this.bufPO[bufI] = palIndex;
						}
						if(canPS){
							minPSX = Math.min(w, minPSX);
							minPSY = Math.min(h, minPSY);
							maxPSX = Math.max(w, maxPSX);
							maxPSY = Math.max(h, maxPSY);
							this.bufPS[bufI] = palIndex;
						}
					}else{
						if(canPO){
							//The buffer in over mode can recycle it using a transparent pixel if it matches.
							this.bufPO[bufI] = this.paletteTransI;
							//The source buffer will leave it as is. (Source will write all pixels in the region and transparency will overwrite things in source mode.)
						}
						if(canPS){//This must be filled. A pixel lower down and to the left could expand it where this is in the region after being passed over.
							this.bufPS[bufI] = palIndex;
						}
					}
				}
				if( (canNS || canNO) ){
					if(this.bufNone[bufI] != palIndex){
						if(canNO){
							if(pixHasAlpha && (this.palette[this.bufNone[bufI]] >> 24 & 0xFF) > 0){
								//If overwriting a pixel that has opacity with one that has transparency.
								canNO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minNOX = Math.min(w, minNOX);
							minNOY = Math.min(h, minNOY);
							maxNOX = Math.max(w, maxNOX);
							maxNOY = Math.max(h, maxNOY);
							this.bufNO[bufI] = palIndex;
						}
						if(canNS){
							minNSX = Math.min(w, minNSX);
							minNSY = Math.min(h, minNSY);
							maxNSX = Math.max(w, maxNSX);
							maxNSY = Math.max(h, maxNSY);
							this.bufNS[bufI] = palIndex;
						}
					}else{
						if(canNO){
							this.bufNO[bufI] = this.paletteTransI;
						}
						if(canNS){
							this.bufNS[bufI] = palIndex;
						}
					}
				}
				if( (canTS || canTO) ){
					if(this.bufTran[bufI] != palIndex){
						if(canTO){
							if(pixHasAlpha && (this.palette[this.bufTran[bufI]] >> 24 & 0xFF) > 0){
								//If overwriting a pixel that has opacity with one that has transparency.
								canTO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minTOX = Math.min(w, minTOX);
							minTOY = Math.min(h, minTOY);
							maxTOX = Math.max(w, maxTOX);
							maxTOY = Math.max(h, maxTOY);
							this.bufTO[bufI] = palIndex;
						}
						if(canTS){
							minTSX = Math.min(w, minTSX);
							minTSY = Math.min(h, minTSY);
							maxTSX = Math.max(w, maxTSX);
							maxTSY = Math.max(h, maxTSY);
							this.bufTS[bufI] = palIndex;
						}
					}else{
						if(canTO){
							this.bufTO[bufI] = this.paletteTransI;
						}
						if(canTS){
							this.bufTS[bufI] = palIndex;
						}
					}
				}
			//==================================== 32-bit RGBA =====================================
			}else if(this.byteStreamMode == 4){
				pixHasAlpha = fRGBA.data[i + 3] < 0xFF;
				if( (canPS || canPO) ){
					if(!(
						   this.bufPrev[bufI]     == fRGBA.data[i]
						&& this.bufPrev[bufI + 1] == fRGBA.data[i + 1]
						&& this.bufPrev[bufI + 2] == fRGBA.data[i + 2]
						&& this.bufPrev[bufI + 3] == fRGBA.data[i + 3]
						)){
						if(canPO){
							//The boolean if will eat part of the boolean operation if not put in ( )
							if(pixHasAlpha && this.bufPrev[bufI + 3] > 0){
								//If overwriting a pixel that has opacity with one that has transparency.
								canPO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minPOX = Math.min(w, minPOX);
							minPOY = Math.min(h, minPOY);
							maxPOX = Math.max(w, maxPOX);
							maxPOY = Math.max(h, maxPOY);
							this.bufPO[bufI]     = fRGBA.data[i];
							this.bufPO[bufI + 1] = fRGBA.data[i + 1];
							this.bufPO[bufI + 2] = fRGBA.data[i + 2];
							this.bufPO[bufI + 3] = fRGBA.data[i + 3];
						}
						if(canPS){
							minPSX = Math.min(w, minPSX);
							minPSY = Math.min(h, minPSY);
							maxPSX = Math.max(w, maxPSX);
							maxPSY = Math.max(h, maxPSY);
							this.bufPS[bufI]     = fRGBA.data[i];
							this.bufPS[bufI + 1] = fRGBA.data[i + 1];
							this.bufPS[bufI + 2] = fRGBA.data[i + 2];
							this.bufPS[bufI + 3] = fRGBA.data[i + 3];
						}
					}else{
						if(canPO){
							//The buffer in over mode can recycle it using a transparent pixel if it matches.
							this.bufPO[bufI]     = 0;
							this.bufPO[bufI + 1] = 0;
							this.bufPO[bufI + 2] = 0;
							this.bufPO[bufI + 3] = 0;
							//The source buffer will leave it as is. (Source will write all pixels in the region and transparency will overwrite things in source mode.)
						}
						if(canPS){//This must be filled. A pixel lower down and to the left could expand it where this is in the region after being passed over.
							this.bufPS[bufI]     = fRGBA.data[i];
							this.bufPS[bufI + 1] = fRGBA.data[i + 1];
							this.bufPS[bufI + 2] = fRGBA.data[i + 2];
							this.bufPS[bufI + 3] = fRGBA.data[i + 3];
						}
					}
				}
				if( (canNS || canNO) ){
					if(!(
						   this.bufNone[bufI]     == fRGBA.data[i]
						&& this.bufNone[bufI + 1] == fRGBA.data[i + 1]
						&& this.bufNone[bufI + 2] == fRGBA.data[i + 2]
						&& this.bufNone[bufI + 3] == fRGBA.data[i + 3]
						)){
						if(canNO){
							if(pixHasAlpha && this.bufNone[bufI + 3] > 0){
								//If overwriting a pixel that has opacity with one that has transparency.
								canNO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minNOX = Math.min(w, minNOX);
							minNOY = Math.min(h, minNOY);
							maxNOX = Math.max(w, maxNOX);
							maxNOY = Math.max(h, maxNOY);
							this.bufNO[bufI]     = fRGBA.data[i];
							this.bufNO[bufI + 1] = fRGBA.data[i + 1];
							this.bufNO[bufI + 2] = fRGBA.data[i + 2];
							this.bufNO[bufI + 3] = fRGBA.data[i + 3];
						}
						if(canNS){
							minNSX = Math.min(w, minNSX);
							minNSY = Math.min(h, minNSY);
							maxNSX = Math.max(w, maxNSX);
							maxNSY = Math.max(h, maxNSY);
							this.bufNS[bufI]     = fRGBA.data[i];
							this.bufNS[bufI + 1] = fRGBA.data[i + 1];
							this.bufNS[bufI + 2] = fRGBA.data[i + 2];
							this.bufNS[bufI + 3] = fRGBA.data[i + 3];
						}
					}else{
						if(canNO){//Recycle matching pixel by drawing nothing over it(works on Over only)
							this.bufNO[bufI]     = 0;
							this.bufNO[bufI + 1] = 0;
							this.bufNO[bufI + 2] = 0;
							this.bufNO[bufI + 3] = 0;
						}
						if(canNS){
							this.bufNS[bufI]     = fRGBA.data[i];
							this.bufNS[bufI + 1] = fRGBA.data[i + 1];
							this.bufNS[bufI + 2] = fRGBA.data[i + 2];
							this.bufNS[bufI + 3] = fRGBA.data[i + 3];
						}
					}
				}
				if( (canTS || canTO) ){
					if(!(
						   this.bufTran[bufI]     == fRGBA.data[i]
						&& this.bufTran[bufI + 1] == fRGBA.data[i + 1]
						&& this.bufTran[bufI + 2] == fRGBA.data[i + 2]
						&& this.bufTran[bufI + 3] == fRGBA.data[i + 3]
						)){
						if(canTO){
							if(pixHasAlpha && this.bufTran[bufI + 3] > 0){
								//If overwriting a pixel that has opacity with one that has transparency.
								canTO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minTOX = Math.min(w, minTOX);
							minTOY = Math.min(h, minTOY);
							maxTOX = Math.max(w, maxTOX);
							maxTOY = Math.max(h, maxTOY);
							this.bufTO[bufI]     = fRGBA.data[i];
							this.bufTO[bufI + 1] = fRGBA.data[i + 1];
							this.bufTO[bufI + 2] = fRGBA.data[i + 2];
							this.bufTO[bufI + 3] = fRGBA.data[i + 3];
						}
						if(canTS){
							minTSX = Math.min(w, minTSX);
							minTSY = Math.min(h, minTSY);
							maxTSX = Math.max(w, maxTSX);
							maxTSY = Math.max(h, maxTSY);
							this.bufTS[bufI]     = fRGBA.data[i];
							this.bufTS[bufI + 1] = fRGBA.data[i + 1];
							this.bufTS[bufI + 2] = fRGBA.data[i + 2];
							this.bufTS[bufI + 3] = fRGBA.data[i + 3];
						}
					}else{
						if(canTO){
							this.bufTO[bufI]     = 0;
							this.bufTO[bufI + 1] = 0;
							this.bufTO[bufI + 2] = 0;
							this.bufTO[bufI + 3] = 0;
						}
						if(canTS){
							this.bufTS[bufI]     = fRGBA.data[i];
							this.bufTS[bufI + 1] = fRGBA.data[i + 1];
							this.bufTS[bufI + 2] = fRGBA.data[i + 2];
							this.bufTS[bufI + 3] = fRGBA.data[i + 3];
						}
					}
				}
			//==================================== 24-bit RGB =====================================
			}else{
				pixHasAlpha = fRGBA.data[i + 3] == 0;//< 0x7F;
						    //Should be < 0xFF, but patterned transparency coming thru, which means
						//there might be something non-optimal in the RGBA quantizer.
						//Either that or the channels are not aligning correctly due to it being 3 byte instead of 4 somehow...
						//Some values that should round all the way up may not be getting rounded up to 0xFF...
							//That quantization code should be looked at.
				//The canvas input is still RGBA, but when writing the byte stream only the reserved RGB code is transparent.
				if( (canPS || canPO) ){
					if(!(
						   this.bufPrev[bufI]     == fRGBA.data[i]
						&& this.bufPrev[bufI + 1] == fRGBA.data[i + 1]
						&& this.bufPrev[bufI + 2] == fRGBA.data[i + 2]
						)){
						if(canPO){
							//The boolean if will eat part of the boolean operation if not put in ( )
							if(pixHasAlpha &&
							     (this.bufPrev[bufI]     != this.reservedTransColor[0]
							   && this.bufPrev[bufI + 1] != this.reservedTransColor[1]
							   && this.bufPrev[bufI + 2] != this.reservedTransColor[2]
								)){
								//If overwriting a pixel that has opacity with one that has transparency.
								canPO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minPOX = Math.min(w, minPOX);
							minPOY = Math.min(h, minPOY);
							maxPOX = Math.max(w, maxPOX);
							maxPOY = Math.max(h, maxPOY);
							if(pixHasAlpha){//A transparent pixel must be drawn with the reserved transparent R,G,B
								this.bufPO[bufI]     = this.reservedTransColor[0];
								this.bufPO[bufI + 1] = this.reservedTransColor[1];
								this.bufPO[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufPO[bufI]     = fRGBA.data[i];
								this.bufPO[bufI + 1] = fRGBA.data[i + 1];
								this.bufPO[bufI + 2] = fRGBA.data[i + 2];
							}
						}
						if(canPS){
							minPSX = Math.min(w, minPSX);
							minPSY = Math.min(h, minPSY);
							maxPSX = Math.max(w, maxPSX);
							maxPSY = Math.max(h, maxPSY);
							if(pixHasAlpha){
								this.bufPS[bufI]     = this.reservedTransColor[0];
								this.bufPS[bufI + 1] = this.reservedTransColor[1];
								this.bufPS[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufPS[bufI]     = fRGBA.data[i];
								this.bufPS[bufI + 1] = fRGBA.data[i + 1];
								this.bufPS[bufI + 2] = fRGBA.data[i + 2];
							}
						}
					}else{
						if(canPO){
							//The buffer in over mode can recycle it using a transparent pixel if it matches.
							this.bufPO[bufI]     = this.reservedTransColor[0];
							this.bufPO[bufI + 1] = this.reservedTransColor[1];
							this.bufPO[bufI + 2] = this.reservedTransColor[2];
							//The source buffer will leave it as is. (Source will write all pixels in the region and transparency will overwrite things in source mode.)
						}
						if(canPS){//This must be filled. A pixel lower down and to the left could expand it where this is in the region after being passed over.
							if(pixHasAlpha){
								this.bufPS[bufI]     = this.reservedTransColor[0];
								this.bufPS[bufI + 1] = this.reservedTransColor[1];
								this.bufPS[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufPS[bufI]     = fRGBA.data[i];
								this.bufPS[bufI + 1] = fRGBA.data[i + 1];
								this.bufPS[bufI + 2] = fRGBA.data[i + 2];
							}
						}
					}
				}
				if( (canNS || canNO) ){
					if(!(
						   this.bufNone[bufI]     == fRGBA.data[i]
						&& this.bufNone[bufI + 1] == fRGBA.data[i + 1]
						&& this.bufNone[bufI + 2] == fRGBA.data[i + 2]
						)){
						if(canNO){
							if(pixHasAlpha &&
							     (this.bufNone[bufI]     != this.reservedTransColor[0]
							   && this.bufNone[bufI + 1] != this.reservedTransColor[1]
							   && this.bufNone[bufI + 2] != this.reservedTransColor[2]
								)){
								//If overwriting a pixel that has opacity with one that has transparency.
								canNO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minNOX = Math.min(w, minNOX);
							minNOY = Math.min(h, minNOY);
							maxNOX = Math.max(w, maxNOX);
							maxNOY = Math.max(h, maxNOY);
							if(pixHasAlpha){
								this.bufNO[bufI]     = this.reservedTransColor[0];
								this.bufNO[bufI + 1] = this.reservedTransColor[1];
								this.bufNO[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufNO[bufI]     = fRGBA.data[i];
								this.bufNO[bufI + 1] = fRGBA.data[i + 1];
								this.bufNO[bufI + 2] = fRGBA.data[i + 2];
							}
						}
						if(canNS){
							minNSX = Math.min(w, minNSX);
							minNSY = Math.min(h, minNSY);
							maxNSX = Math.max(w, maxNSX);
							maxNSY = Math.max(h, maxNSY);
							if(pixHasAlpha){
								this.bufNS[bufI]     = this.reservedTransColor[0];
								this.bufNS[bufI + 1] = this.reservedTransColor[1];
								this.bufNS[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufNS[bufI]     = fRGBA.data[i];
								this.bufNS[bufI + 1] = fRGBA.data[i + 1];
								this.bufNS[bufI + 2] = fRGBA.data[i + 2];
							}
						}
					}else{
						if(canNO){//Recycle matching pixel by drawing nothing over it(works on Over only)
							this.bufNO[bufI]     = this.reservedTransColor[0];
							this.bufNO[bufI + 1] = this.reservedTransColor[1];
							this.bufNO[bufI + 2] = this.reservedTransColor[2];
						}
						if(canNS){
							if(pixHasAlpha){
								this.bufNS[bufI]     = this.reservedTransColor[0];
								this.bufNS[bufI + 1] = this.reservedTransColor[1];
								this.bufNS[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufNS[bufI]     = fRGBA.data[i];
								this.bufNS[bufI + 1] = fRGBA.data[i + 1];
								this.bufNS[bufI + 2] = fRGBA.data[i + 2];
							}
						}
					}
				}
				if( (canTS || canTO) ){
					if(!(
						   this.bufTran[bufI]     == fRGBA.data[i]
						&& this.bufTran[bufI + 1] == fRGBA.data[i + 1]
						&& this.bufTran[bufI + 2] == fRGBA.data[i + 2]
						)){
						if(canTO){
							if(pixHasAlpha &&
							     (this.bufTran[bufI]     != this.reservedTransColor[0]
							   && this.bufTran[bufI + 1] != this.reservedTransColor[1]
							   && this.bufTran[bufI + 2] != this.reservedTransColor[2]
								)){
								//If overwriting a pixel that has opacity with one that has transparency.
								canTO = false;//Cannot draw transparent pixels over ones with opacity using Over blending.
							}
							minTOX = Math.min(w, minTOX);
							minTOY = Math.min(h, minTOY);
							maxTOX = Math.max(w, maxTOX);
							maxTOY = Math.max(h, maxTOY);
							if(pixHasAlpha){
								this.bufTO[bufI]     = this.reservedTransColor[0];
								this.bufTO[bufI + 1] = this.reservedTransColor[1];
								this.bufTO[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufTO[bufI]     = fRGBA.data[i];
								this.bufTO[bufI + 1] = fRGBA.data[i + 1];
								this.bufTO[bufI + 2] = fRGBA.data[i + 2];
							}
						}
						if(canTS){
							minTSX = Math.min(w, minTSX);
							minTSY = Math.min(h, minTSY);
							maxTSX = Math.max(w, maxTSX);
							maxTSY = Math.max(h, maxTSY);
							if(pixHasAlpha){
								this.bufTS[bufI]     = this.reservedTransColor[0];
								this.bufTS[bufI + 1] = this.reservedTransColor[1];
								this.bufTS[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufTS[bufI]     = fRGBA.data[i];
								this.bufTS[bufI + 1] = fRGBA.data[i + 1];
								this.bufTS[bufI + 2] = fRGBA.data[i + 2];
							}
						}
					}else{
						if(canTO){
							this.bufTO[bufI]     = this.reservedTransColor[0];
							this.bufTO[bufI + 1] = this.reservedTransColor[1];
							this.bufTO[bufI + 2] = this.reservedTransColor[2];
						}
						if(canTS){
							if(pixHasAlpha){
								this.bufTS[bufI]     = this.reservedTransColor[0];
								this.bufTS[bufI + 1] = this.reservedTransColor[1];
								this.bufTS[bufI + 2] = this.reservedTransColor[2];
							}else{
								this.bufTS[bufI]     = fRGBA.data[i];
								this.bufTS[bufI + 1] = fRGBA.data[i + 1];
								this.bufTS[bufI + 2] = fRGBA.data[i + 2];
							}
						}
					}
				}
			}
		}}//end w,h
		if(this.frameBeingProcessed == 0){
			//Ensure that the first frame draws the whole image area. (fcTL,IDAT does not support partial region, fcTL,fdAT does.)
			//Frame 1 always uses Tran-Source.
			minTSX = 0;maxTSX = this.outputWidth-1;minTSY = 0; maxTSY = this.outputHeight - 1;
		}
		//alert('should have ' + ((frameFinalW * frameFinalH) + frameFinalH) + ', stopped at ' + indexPos);
		//if(this.frameBeingProcessed == 0){
		//	this.nRGBA = fRGBA;
		//}//else{
		//	this.pRGBA = this.nRGBA;
		//	this.nRGBA = ......
		//}
		
		/*

Doing dispose to transparent black makes no difference for the updated region if doing blend Source since Source overwrites alpha anyways,
assuming that the region being updated is the same region that got cleared.
Dispose to transparent would save space when the whole updated area needs to be wiped, and the next frame only has a smaller section that is not transparent.
An object that moves around in a transparent area is a common example where dispose to transparent is optimal.
Example:
+------------------+ Frame 1
|       ***        |
|     ***#****     |
|    ***####***    |
|     ********     |
|                  |
+------------------+
+------------------+ Frame 2
|                  |
|                  |
|        *****     |
|       **###**    |
|        *****     |
+------------------+
Can dispose to transparent black and only has to draw:
       X
       |       |
       | Width |
-------+-------+----Y
       | ***** |    
       |**###**| Height
       | ***** |    
-------+-------+----


(This of course assumes that frame one was drawn over the whole area, not just a smaller update to data from a previous frame
in a smaller region. Remember that dispose to transparent clears out THE REGION which was drawn on, which is not the whole
image if only a region of it was drawn on for that frame)
If frame 2 were completely blank, it could dispose to transparent and then draw a 1x1 transparent frame with just one pixel.

Logic to detect when dispose to previous is optimal may be added later.
For now, focus will be on disposal of previous or none, since those are more likely to be optimal in most cases.

There will be several buffers.
None-Over
Prev-Over
Tran-Over
None-Source
Prev-Source
Tran-Source
These describe the disposal method from the PREVIOUS frame,
and the blend mode for the CURRENT frame.

Step 1:
Draw updates as needed on to each buffer.
Track the min/max x/y of where changes occur so that only the updated region needs to be outputted.

Once a change to a pixel that has transparency is encountered for an -Over buffer, the buffer that encountered it will
be eliminated as a possibility since it is incapable of representing the update.

Step 2:
Select whatever buffer that has not been eliminated that is optimal.
Extract the region which changed occur and compress it and see which is smallest.
(Remember, smaller dimension areas or less changes will not always result in smaller data,
sometimes different data just compresses better.)
-Over buffers should always be chosen instead of the -Source equivalent because they can recycle pixels,
but in some cases the -Over version will be eliminated and -Source will be chosen for that disposal method.
Logic may be added at some point to predict which will likely be better and skip having to do multiple compressions.

Step 3:
Update the fcTL of the previous frame to match the disposal method picked.


Exceptions:

The first frame will always use Tran-Source to draw from buffer because there is no previous or undisposed image data to draw on top of.
It also must draw the whole frame, not just a region, because the IDAT used by the first frame does not support sub-regions.
(If a default image were used the restriction on region could technically be avoided.)

The second frame will immediately eliminate the Prev-Over/Prev-Source buffers, because the first frame cannot dispose to previous.


The buffer logic is a bit complex, it goes like this:

..............   ..............   .............. No frames drawn yet, empty buffers.
.            .   .            .   .            . (Assumed transparent black)
.    None    .   .  Previous  .   .Transparent .
.            .   .            .   .            .
..............   ..............   ..............
                                .            . 
                              .            .
                            .            .
                          .            .
                        .            .
                      .            .
                    .            .
                 +------------+                  Frame 1
                 |   ******   |                  (There are no previous frames so assume transparent black on whole frame.)
                 |  *******   |    Draw frame on top of the transparent background.
                 | ********** |
                .+------------+.
              .  .            .  .
            .    .            .    .
          .      .            .      .
        .        .            .        .
      .          .            .          .
    .          . .            . .          .
  .          .   .            .   .          .
 /\/\/\/\/\/\     /\/\/\/\/\/\     /\/\/\/\/\/\  Build temporary buffers containing the possible ways to start the next frame.
|   ******   |   |            |   |            | 
|  **None*   |   |  Previous  |   |Transparent |
| ********** |   |            |   |            |
 \/\/\/\/\/\/     \/\/\/\/\/\/     \/\/\/\/\/\/ 
  .           .
    .           .
      .           .
        .           .
          .           .
            .           .
              .           .
                .           .
                 +------------+                  Frame 2
                 |   **   *   |                  
                 |  **** **   |    Draw on top of each buffer, then compare and see what results in the smallest frame, use that one.
                 | **    **** |    (Use Over method if possible to recycle matching pixels between frames,
                .+------------+.    but Source method will be used on buffers that cannot be updated with Over)
              .  .            .  .
            .    .            .    .
          .      .            .      .
        .        .            .        .
      .          .            .          .
    .          . .            . .          .
  .          .   .            .   .          .
 /\/\/\/\/\/\     /\/\/\/\/\/\     /\/\/\/\/\/\  Build temporary buffers containing the possible ways to start the next frame.
|   **  **   |   |   ******   |   |        *   | 
|  **** **   |   |  *******   |   |  *     *   |
| **    **** |   | ********** |   | **     *** |
 \/\/\/\/\/\/     \/\/\/\/\/\/     \/\/\/\/\/\/ 
     None           Previous       Transparent

Previous can be set to what exists in the None buffer,
None can be set to what was just drawn.
Transparent can be copied from none, but with the region covered by this frame cleared out to transparent black.

    ....Repeat N times....


		*/
		
		//If a frame is blank, make it have one pixel, 0x0 is not valid.
		if(minNOX>maxNOX||minNOY>maxNOY){//they can be the same number, but min should not be greater than max, max should not be greater than min.
			minNOX = 0;maxNOX = 1;minNOY = 0;maxNOY = 1;
		}
		if(minPOX>maxPOX||minPOY>maxPOY){
			minPOX = 0;maxPOX = 1;minPOY = 0;maxPOY = 1;
		}
		if(minTOX>maxTOX||minTOY>maxTOY){
			minTOX = 0;maxTOX = 1;minTOY = 0;maxTOY = 1;
		}
		if(minNSX>maxNSX||minNSY>maxNSY){
			minNSX = 0;maxNSX = 1;minNSY = 0;maxNSY = 1;
		}
		if(minPSX>maxPSX||minPSY>maxPSY){
			minPSX = 0;maxPSX = 1;minPSY = 0;maxPSY = 1;
		}
		if(minTSX>maxTSX||minTSY>maxTSY){
			minTSX = 0;maxTSX = 1;minTSY = 0;maxTSY = 1;
		}
		//TODO: remove frame and increment duration of previous frame if no changes
		//select the disposal mode where it was able to get it with no changed region required.
		//that of course means the buffers stay as is and it gets delayed.
		//If a frame after the first one recycled in this way can also be recycled, but would require a different disposal on the 
		//previous frame that is a problem because changing the disposal would disregard the segments that were achieved with the original
		//disposal used to recycle. In that case that frame needs to be drawn it would seem...
		//Also note that the frame count in acTL would need to be altered to reflect this.
		
		//force full frame update for debugging
		/*minNOX = 0;maxNOX = this.outputWidth - 1;minNOY = 0;maxNOY = this.outputHeight - 1;
		minPOX = 0;maxPOX = this.outputWidth - 1;minPOY = 0;maxPOY = this.outputHeight - 1;
		minTOX = 0;maxTOX = this.outputWidth - 1;minTOY = 0;maxTOY = this.outputHeight - 1;
		minNSX = 0;maxNSX = this.outputWidth - 1;minNSY = 0;maxNSY = this.outputHeight - 1;
		minPSX = 0;maxPSX = this.outputWidth - 1;minPSY = 0;maxPSY = this.outputHeight - 1;
		minTSX = 0;maxTSX = this.outputWidth - 1;minTSY = 0;maxTSY = this.outputHeight - 1;*/
		var widthN = 0, heightN = 0, widthP = 0, heightP = 0, widthT = 0, heightT = 0;
		
		var streamNone = false, streamPrev = false, streamTran = false, bufN, bufP, bufT,
			minNX, maxNX, minNY, maxNY, minPX, maxPX, minPY, maxPY, minTX, maxTX, minTY, maxTY;
			//add a height worth for the filter mode on each scanline.
		//Disposal of None, Previous, and Tran can each have up to 1 buffer, and must choose between Over and Source.
		//Over should always be chosen unless Over has been eliminated as unable to represent the update.
		if(canNS || canNO){//Always check source first, it is less likely to be off
			if(canNO){
				bufN = this.bufNO;minNX = minNOX;maxNX = maxNOX;minNY = minNOY;maxNY = maxNOY;
			}else{
				bufN = this.bufNS;minNX = minNSX;maxNX = maxNSX;minNY = minNSY;maxNY = maxNSY;
			}
			widthN  = maxNX + 1 - minNX;
			heightN = maxNY + 1 - minNY;
			streamNone = new Uint8Array(new ArrayBuffer(widthN * heightN * this.byteStreamMode + heightN));//+height because first byte of scanline is filter mode
		}
		if(canPS || canPO){
			if(canPO){
				bufP = this.bufPO;minPX = minPOX;maxPX = maxPOX;minPY = minPOY;maxPY = maxPOY;
			}else{
				bufP = this.bufPS;minPX = minPSX;maxPX = maxPSX;minPY = minPSY;maxPY = maxPSY;
			}
			widthP  = maxPX + 1 - minPX;
			heightP = maxPY + 1 - minPY;
			streamPrev = new Uint8Array(new ArrayBuffer(widthP * heightP * this.byteStreamMode + heightP));
		}
		if(canTS || canTO){
			if(canTO){
				bufT = this.bufTO;minTX = minTOX;maxTX = maxTOX;minTY = minTOY;maxTY = maxTOY;
			}else{
				bufT = this.bufTS;minTX = minTSX;maxTX = maxTSX;minTY = minTSY;maxTY = maxTSY;
			}
		 	widthT  = maxTX + 1 - minTX;
			heightT = maxTY + 1 - minTY;
			streamTran = new Uint8Array(new ArrayBuffer(widthT * heightT * this.byteStreamMode + heightT));
		}
		//+1 because the maximum value would be 9 for 0-9 on a 10 width region, etc.
		
		//Some min/max x/y may always be the same for Over and Source and that could get looked into...
		
		
		var nonePos = 0, prevPos = 0, tranPos = 0, chosenDrawBuffer, chosenDisposeBuffer;
		bufI = 0;
		//Needed for some byte filtering calculations.
		var fullScanWidth = this.outputWidth * this.byteStreamMode;
		//var scanWidthN = widthN * this.byteStreamMode;//Needed for some byte filtering calculations.
		//var scanWidthP = widthP * this.byteStreamMode;
		//var scanWidthT = widthT * this.byteStreamMode;
		
		//(OLD WAY, misses lots of opportunities to optimize line-by-line)
		//When writing lots of transparent pixels to recycle matches between frames,
		//and with quantization making more pixels next to each other the same,
		//there will be lots of single-color areas that get allot of zeroes when subtracting between frames
		//when comparing to the pixel next to it like Up and Sub mode do.
		//More zeroes or repeating values after being filtered means lower entropy, causing better compression when deflated.
		//If height is greater use Up filtering, otherwise use Sub
		//(that way there are less cases where it is at the edge with no data to the left(Sub) or above(Up) to filter it with)
		//var filterN = heightN > widthN ? 2 : 1;
		//var filterP = heightP > widthP ? 2 : 1;
		//var filterT = heightT > widthT ? 2 : 1;
		
		//var canZeroTransparents = this.byteStreamMode == 4;//mode 4 can have the RGB set to zeroes when fully transparent and assume optimal values. (It is not visible and does not matter what is there.)
								//(theoretically could swap for mode 2 grayscale/alpha if supported)
		for(h = 0;h < this.outputHeight;h++){

			for(var streamI = 0;streamI < 3;streamI++){
				var sStream, sBuf, sPos, sByte, sRegionWidth, sStreamPos;
				var sMinY, sMaxY, sMinX, sMaxX;
				if(streamI == 0){
					sStream = streamNone;
					sBuf = bufN;
					sRegionWidth = widthN * this.byteStreamMode;
					sMinY = minNY;sMaxY = maxNY;sMinX = minNX;sMaxX = maxNX;
					sStreamPos = nonePos;//current position in disposal-specific region.
				}else if(streamI == 1){
					sStream = streamPrev;
					sBuf = bufP;
					sRegionWidth = widthP * this.byteStreamMode;
					sMinY = minPY;sMaxY = maxPY;sMinX = minPX;sMaxX = maxPX;
					sStreamPos = prevPos;//current position in disposal-specific region.
				}else{
					sStream = streamTran;
					sBuf = bufT;
					sRegionWidth = widthT * this.byteStreamMode;
					sMinY = minTY;sMaxY = maxTY;sMinX = minTX;sMaxX = maxTX;
					sStreamPos = tranPos;//current position in disposal-specific region.
				}
				//don't bother if the stream is not able to represent the part of the image, or the current scanline is out of range for the updated region.
				if(sStream && h >= sMinY && h <= sMaxY){
					var sRegionWidthPlusFilter = sRegionWidth + 1;
					//Make the scanline test streams include the filter mode byte at the start.
					//This is PART of the IDAT/fdAT stream and CAN affect efficiency.
					var 	sModeNone = new Uint8Array(new ArrayBuffer(sRegionWidthPlusFilter)),
						sModeSub = new Uint8Array(new ArrayBuffer(sRegionWidthPlusFilter)),
						sModeUp = new Uint8Array(new ArrayBuffer(sRegionWidthPlusFilter)),
						sModeAverage = new Uint8Array(new ArrayBuffer(sRegionWidthPlusFilter)),
						sModePaeth = new Uint8Array(new ArrayBuffer(sRegionWidthPlusFilter));
					//Set filter mode codes at first byte.
					sModeNone[0] = 0;sModeSub[0] = 1;sModeUp[0] = 2;sModeAverage[0] = 3;sModePaeth[0] = 4;
					bufI = fullScanWidth * h + sMinX * this.byteStreamMode;//reset it each time since it loops with the 3 different disposals.
					sPos = 1;//position in the temporary scaliness with each filter mode to compare which one is best. Start after the filter mode byte.
					for(w = sMinX;w <= sMaxX;w++){
						//if(w >= sMinX && w <= sMaxX){
							for(chanI = 0;chanI < this.byteStreamMode;chanI++){//8, 24, and 32 bit pixels must be accounted for
								/*
								//TODO: Get this working. This should be able to optimize pixels that are fully transparent in RGBA mode
								//where the RGB does not matter, but the source buffer would need to be altered to reflect this,
								//because the next scanline will compare the RGBA values that are in there.
								if(canZeroTransparents && sBuf[bufI + 3] == 0 && chanI < 3){//If fully transparent and safe to zero out
									sModeNone[sPos] = 0;
									sModeSub[sPos] = 0;
									sModeUp[sPos] = 0;
									sModeAverage[sPos] = 0;
									sModePaeth[sPos] = 0;
									//sNoneZeroes++;
									//sSubZeroes++;
									//sUpZeroes++;
									//sAverageZeroes++;
									//sPaethZeroes++;
								}else{
								*/
								
								sByte = sBuf[bufI + chanI];
								sModeNone[sPos] = sByte;
								//if(sByte == 0){sNoneZeroes++;}
								
								sByte = this.filterBytePNG(sBuf, bufI + chanI, 1, w, h, sMinX, sMinY, fullScanWidth);
								sModeSub[sPos] = sByte;
								//if(sByte == 0){sSubZeroes++;}
								
								sByte = this.filterBytePNG(sBuf, bufI + chanI, 2, w, h, sMinX, sMinY, fullScanWidth);
								sModeUp[sPos] = sByte;
								//if(sByte == 0){sUpZeroes++;}
								
								sByte = this.filterBytePNG(sBuf, bufI + chanI, 3, w, h, sMinX, sMinY, fullScanWidth);
								sModeAverage[sPos] = sByte;
								//if(sByte == 0){sAverageZeroes++;}
								
								sByte = this.filterBytePNG(sBuf, bufI + chanI, 4, w, h, sMinX, sMinY, fullScanWidth);
								sModePaeth[sPos] = sByte;
								//if(sByte == 0){sPaethZeroes++;}
								
								//}//end not transparent-zeroable
								
								sPos++;
							}
						//}
						bufI += this.byteStreamMode;
					}
					//Test a quick deflate of the scanline and scalines above it if not the first line.
					//Other techniques of counting zeroes and things add lots of bloat and complexity,
					//but do not account for things like repeated strings and more advanced patterns that repeat and compress well.
					var sNoneScore, sSubScore, sUpScore, sAverageScore, sPaethScore;
					sPos = sStreamPos;//set to the actual position in the scan data region for current disposal
					var lastFewScans;//combines the current filtered bytes with the previous lines to see how it compresses in context with the things around it.
					//the relation to repeated patterns close to it is also important.
					var scanPrePos = sPos - sRegionWidthPlusFilter * 2;//length of previous lines inserted for context. May be 0 if first line.
					if(scanPrePos < 0){scanPrePos = 0;}//If it is the first line or close to it, make sure it does not go out of range.
					lastFewScans = sStream.subarray(scanPrePos, sPos + sRegionWidthPlusFilter);
					//insert the scan being processed after the first few that were inserted at the start
					var scanInsPos = lastFewScans.length - sRegionWidthPlusFilter;
					
					if(window.pako){
						//This is a quick test to see what scanline version compresses well, use pako if possible because it is the fastest.
						//So far, there does not appear to be savings from doing this test with more intense settings.
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeNone[w];}
						sNoneScore = window.pako.deflateRaw(lastFewScans).length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeSub[w];}
						sSubScore = window.pako.deflateRaw(lastFewScans).length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeUp[w];}
						sUpScore = window.pako.deflateRaw(lastFewScans).length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeAverage[w];}
						sAverageScore = window.pako.deflateRaw(lastFewScans).length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModePaeth[w];}
						sPaethScore = window.pako.deflateRaw(lastFewScans).length;
					}else{
						var dTestOptions = {"iterations":1};
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeNone[w];}
						sNoneScore = new Zopfli.DeflateRaw(lastFewScans, dTestOptions).compress().length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeSub[w];}
						sSubScore = new Zopfli.DeflateRaw(lastFewScans, dTestOptions).compress().length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeUp[w];}
						sUpScore = new Zopfli.DeflateRaw(lastFewScans, dTestOptions).compress().length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModeAverage[w];}
						sAverageScore = new Zopfli.DeflateRaw(lastFewScans, dTestOptions).compress().length;
						for(w = 0;w < sRegionWidthPlusFilter;w++){lastFewScans[scanInsPos + w] = sModePaeth[w];}
						sPaethScore = new Zopfli.DeflateRaw(lastFewScans, dTestOptions).compress().length;
					}
					var sOptimalMode = sModeNone;
					var sBestScore = sNoneScore;//lower is better when going by deflated length
					if(sSubScore < sBestScore){sBestScore = sSubScore;sOptimalMode = sModeSub;}
					if(sUpScore < sBestScore){sBestScore = sUpScore;sOptimalMode = sModeUp;}
					if(sAverageScore < sBestScore){sBestScore = sAverageScore;sOptimalMode = sModeAverage;}
					if(sPaethScore < sBestScore){sBestScore = sPaethScore;sOptimalMode = sModePaeth;}
					
					//The filter mode byte is included in the test streams and will be written by this.
					for(w = 0;w < sRegionWidthPlusFilter;w++){
						sStream[sPos] = sOptimalMode[w];
						sPos++;
					}
					//now update the variables(they do not referenceify)
					if(streamI == 0){
						nonePos = sPos;
					}else if(streamI == 1){
						prevPos = sPos;
					}else{
						tranPos = sPos;
					}
				}
			}
			/*
			//(OLD WAY, had no line by line filter mode optimization)
			//write the filter mode at the start of each scanline.
			var noneScan = false, prevScan = false, tranScan = false,
				scanBytes = [ [ [], [], [] ], [ [], [], [] ], [ [], [], [] ] ];
			if(streamNone && h >= minNY && h <= maxNY){
				streamNone[nonePos] = filterN;
				noneScan = true;
				nonePos++;
			}
			if(streamPrev && h >= minPY && h <= maxPY){
				streamPrev[prevPos] = filterP;
				prevScan = true;
				prevPos++;
			}
			if(streamTran && h >= minTY && h <= maxTY){
				streamTran[tranPos] = filterT;
				tranScan = true;
				tranPos++;
			}
			for(w = 0;w < this.outputWidth;w++){
				if(noneScan && streamNone && w >= minNX && w <= maxNX){
					
				}
			}
			for(w = 0;w < this.outputWidth;w++){
				if(noneScan && streamNone && w >= minNX && w <= maxNX){
					for(chanI = 0;chanI < this.byteStreamMode;chanI++){//8, 24, and 32 bit pixels must be accounted for
						streamNone[nonePos] = this.filterBytePNG(bufN, bufI + chanI, filterN, w, h, minNX, minNY, fullScanWidth);
						nonePos++;
					}
				}
				if(prevScan && streamPrev && w >= minPX && w <= maxPX){
					for(chanI = 0;chanI < this.byteStreamMode;chanI++){
						streamPrev[prevPos] = this.filterBytePNG(bufP, bufI + chanI, filterP, w, h, minPX, minPY, fullScanWidth);
						prevPos++;
					}
				}
				if(tranScan && streamTran && w >= minTX && w <= maxTX){
					for(chanI = 0;chanI < this.byteStreamMode;chanI++){
						streamTran[tranPos] = this.filterBytePNG(bufT, bufI + chanI, filterT, w, h, minTX, minTY, fullScanWidth);
						tranPos++;
					}
				}
				bufI += this.byteStreamMode;
			}*/
		}//end h

		var deflateOptions;
		var brutePNG;//To use Zopfli or not.
		if(!window.Zopfli){//No Zopfli present, do not use it.
			brutePNG = false;
		}else if(!window.pako){//No pako present, do not use it.
			brutePNG = true;
		}else{//both are present, use Zopfli if the png.brute parameter evaluates true.
			brutePNG = this.png && this.png.brute;
		}
		if(brutePNG){//use Zopfli
			deflateOptions = {"iterations":15};//Standard Default, 15
			if(typeof this.png.brute === "number"){//If a custom level of iterations is defined by using 1+ rather than just true.
				deflateOptions.iterations = this.png.brute;
			}
		}else{//use pako
			deflateOptions = {
				"windowBits":15,
				"memLevel":9,
				"level":9
			};
		}
		var chosenByteStream, deflatedNone, deflatedPrev, deflatedTran;
		var minCX, maxCX, minCY, maxCY;
		var chosenDisposal;//This is the disposal for the frame BEFORE this one.
		var chosenBlending;//The blend mode of the CURRENT frame.
		if(streamNone){
			if(brutePNG){
				deflatedNone = new Zopfli.Deflate(streamNone, deflateOptions).compress();
			}else{
				deflatedNone = window.pako.deflate(streamNone, deflateOptions);//use .deflate(), NOT .deflateRaw()
			}
			chosenByteStream = deflatedNone;
			chosenDisposeBuffer = this.bufNone;
			chosenDrawBuffer = bufN;
			chosenDisposal = 0;
			chosenBlending = canNO? 1 : 0;
			minCX = minNX;maxCX = maxNX;minCY = minNY;maxCY = maxNY;
		}
		if(streamPrev){
			if(brutePNG){
				deflatedPrev = new Zopfli.Deflate(streamPrev, deflateOptions).compress();
			}else{
				deflatedPrev = window.pako.deflate(streamPrev, deflateOptions);
			}
			if(!chosenByteStream || deflatedPrev.length < chosenByteStream.length){
				chosenByteStream = deflatedPrev;
				chosenDisposeBuffer = this.bufPrev;
				chosenDrawBuffer = bufP;
				chosenDisposal = 2;
				chosenBlending = canPO? 1 : 0;
				minCX = minPX;maxCX = maxPX;minCY = minPY;maxCY = maxPY;
			}
		}
		if(streamTran){
			if(brutePNG){
				deflatedTran = new Zopfli.Deflate(streamTran, deflateOptions).compress();
			}else{
				deflatedTran = window.pako.deflate(streamTran, deflateOptions);
			}
			if(!chosenByteStream || deflatedTran.length < chosenByteStream.length){
				chosenByteStream = deflatedTran;
				chosenDisposeBuffer = this.bufTran;
				chosenDrawBuffer = bufT;
				chosenDisposal = 1;
				chosenBlending = canTO? 1 : 0;
				minCX = minTX;maxCX = maxTX;minCY = minTY;maxCY = maxTY;
			}
		}
		//alert('updated region dim: ' + minCX + ',' +minCY + ' ' + maxCX + ',' + maxCY + ' disp: ' + chosenDisposal + ' blend: ' + chosenBlending);
		if(this.frameBeingProcessed > 0){
			//Updated the disposal code in the previous frame to match what was used.
			this.payloads[this.frameBeingProcessed - 1][32] = chosenDisposal;
		}
		//index8 = window.pako.deflate(index8, deflateOptions);
		//alert('index8 ' + index8.length + ' indexPos: ' + indexPos);
		//create the frame that will contain the chunk data and the deflated PNG8 stream
		var frame8 = new Uint8Array(new ArrayBuffer(12 + chosenByteStream.length
					 + (this.frames.length > 1 ? 38 : 0)
					 + (this.frameBeingProcessed == 0 ? 0 : 4) //(fdAT will have 4 extra bytes over IDAT (the frameSequenceCount))
				));
		var pos = 0;
		if(this.frames.length > 1){//APNG chunks not needed when only one frame and no animation.
			//fcTL chunk needed for each animation frame
			//only one fcTL, though there maybe multiple contiguous fdAT following.
				//(will just make one fdAT/IDAT for PNG8)
			GraFlicEncoder.writeUint32(frame8, 26, pos, false);//length
			GraFlicEncoder.writeFourCC(frame8, 'fcTL', pos + 4);
			GraFlicEncoder.writeUint32(frame8, this.frameSequenceCount, pos + 8, false);
			GraFlicEncoder.writeUint32(frame8, maxCX + 1 - minCX, pos + 12, false);//width
			GraFlicEncoder.writeUint32(frame8, maxCY + 1 - minCY, pos + 16, false);//height
			GraFlicEncoder.writeUint32(frame8, minCX, pos + 20, false);//x
			GraFlicEncoder.writeUint32(frame8, minCY, pos + 24, false);//y
			GraFlicEncoder.writeUint16(frame8, frameDelay,  pos + 28, false);//Numerator (16-bit uint)
			GraFlicEncoder.writeUint16(frame8, 1000,        pos + 30, false);//Denominator (16-bit uint)
			frame8[pos+32] = 0x00;//Disposal. (Will get updated based on what the next frame draws best over.) 0=none, 1=background, 2=previous
			frame8[pos+33] = chosenBlending;//Blending. 0=source, 1 = over
			GraFlicEncoder.writeUint32(frame8, GraFlicEncoder.getCRC32(frame8, pos + 4, pos + 34), pos + 34, false);
			pos += 38;
			this.frameSequenceCount++;
		}//end if more than one frame
		if(this.frameBeingProcessed == 0){//The first frame will be IDAT, after that it will be fdAT
			GraFlicEncoder.writeUint32(frame8, chosenByteStream.length, pos, false);//Does not have frameSeqCount
			GraFlicEncoder.writeFourCC(frame8, 'IDAT', pos + 4);
			for(i = 0;i < chosenByteStream.length;i++){
				frame8[pos + 8 + i] = chosenByteStream[i];
				//document.write( chosenByteStream[i] + ',');
			}
			//0         1         2
			//012345678901234567890
			//####ASCI01234567CRRC
			
			GraFlicEncoder.writeUint32(frame8,GraFlicEncoder.getCRC32(frame8, pos + 4, pos + 8 + chosenByteStream.length), pos + 8 + chosenByteStream.length, false);//4 less with no FrameSequenceCount.
			pos += chosenByteStream.length + 12;//IDAT does not have frameSequenceCount, that was introduced in AnimatedPNG
		}else{//fdAT
			GraFlicEncoder.writeUint32(frame8, chosenByteStream.length + 4, pos, false);//extra 4 to store frameSeqCount
			GraFlicEncoder.writeFourCC(frame8, 'fdAT', pos + 4);
			GraFlicEncoder.writeUint32(frame8, this.frameSequenceCount, pos + 8, false);//fdAT needs a uint32 to store frameSequenceCount
			for(i = 0;i < chosenByteStream.length;i++){
				frame8[pos + 12 + i] = chosenByteStream[i];
			}
			//0         1         2         3
			//0123456789012345678901234567890
			//####ASCIFFSQ01234567CRRC
			GraFlicEncoder.writeUint32(frame8,GraFlicEncoder.getCRC32(frame8, pos + 4, pos + 12 + chosenByteStream.length), pos + 12 + chosenByteStream.length, false);//Must expand range to get the CRC over the FourCC and the extra 4 for the added FrameSequenceCount.
			this.frameSequenceCount++;
			pos += chosenByteStream.length + 16;//must be 4 longer here to hold the FrameSequenceCount
			//for(i = 0;i < frame8.length;i++){
			//	document.write('[' + i + '] ' + frame8[i] + ' ' + String.fromCharCode(frame8[i]) + '<br/>');
			//}
		}
		//alert('frame8 ' + frame8.length);
		this.payloads.push(frame8);
		
		//Then apply disposal methods over it.
		
		var chosenBufferHold = new Uint8Array(new ArrayBuffer(chosenDisposeBuffer.length));//hold onto it until it is done(So it is not overwritten while still needed)
		//(On the first frame, None will always be initialized to all zeroes. But copy it anyways because the newly initialized chosenBufferHold does not initialize to zeroes on all browsers.)
		for(i = 0;i < chosenDisposeBuffer.length;i++){
			chosenBufferHold[i] = chosenDisposeBuffer[i];
		}
		
		//TODO: Over COULD actually write over transparent pixels and have it work if what it is writing is fully opaque.
			//What it cannot do is write transparency over something that is not fully transparent.
		//Draw onto None and Transparent using the selected buffer that the update was drawn based on.
		//For None draw the update in the updated region. For Tran, clear to transparent black background in the updated region.
		bufI = 0;
		for(h = 0;h < this.outputHeight;h++){
			for(w = 0;w < this.outputWidth;w++){
				/*if(w >= minCX && w <= maxCX && h >= minCY && h <= maxCY){
				//Dispose the actual drawn on region with the different dispose methods.
					//Copy what was on None to Prev. That will be the new previous buffer now that it has advanced.
					//Do this before others so it is set to what None previously was with the image as is after it was rendered previously.
					//(Only the region of the disposed frame disposes to what was there previously)
					for(chanI = 0;chanI < this.byteStreamMode;chanI++){
						this.bufPrev[bufI + chanI] = this.bufNone[bufI + chanI];
					}
				}else{*/
					
				//	for(chanI = 0;chanI < this.byteStreamMode;chanI++){
				//	}
				//}
				for(chanI = 0;chanI < this.byteStreamMode;chanI++){//Draw contents of chosen dispose buffer that was drawn on.
					this.bufNone[bufI + chanI] = chosenBufferHold[bufI + chanI];
					this.bufTran[bufI + chanI] = chosenBufferHold[bufI + chanI];
					this.bufPrev[bufI + chanI] = chosenBufferHold[bufI + chanI];
					//For previous mode disposal ALL pixels go to the previouly used buffer
					//for other disposals regions within the updated area are disposed
					//(Remember, areas that are not in the updated region were not changed.)
				}
				//(The region that is actually selected and DRAWN needs to be disposed.)
				if(w >= minCX && w <= maxCX && h >= minCY && h <= maxCY){
					var isTransparentOver = false;
					if(chosenBlending){//Only Over blending does not overwrite what is under it when transparent pixel written.
						if( (this.byteStreamMode == 1 && chosenDrawBuffer[bufI] == this.paletteTransI)
							||
						    (  this.byteStreamMode == 4
						    && chosenDrawBuffer[bufI]     == 0
						    && chosenDrawBuffer[bufI + 1] == 0
						    && chosenDrawBuffer[bufI + 2] == 0
						    && chosenDrawBuffer[bufI + 3] == 0)
							||
						    (  this.byteStreamMode == 3
						    && chosenDrawBuffer[bufI]     == this.reservedTransColor[0]
						    && chosenDrawBuffer[bufI + 1] == this.reservedTransColor[1]
						    && chosenDrawBuffer[bufI + 2] == this.reservedTransColor[2])
							){
							isTransparentOver = true;
						}
					}
					for(chanI = 0;chanI < this.byteStreamMode;chanI++){
						if(!isTransparentOver){//If isTransparentOver, Transparent pixel was drawn to recycle this pixel, so leave it there.
								//If it was transparent before, it will be transparent. If it was something else, it will stay that.
							this.bufNone[bufI + chanI] = chosenDrawBuffer[bufI + chanI];//Keep drawn changes as is in None buffer.
						}
						if(this.byteStreamMode == 1){
							this.bufTran[bufI + chanI] = this.paletteTransI;//Dispose to transparent pixel index.
						}else if(this.byteStreamMode == 4){
							this.bufTran[bufI + chanI] = 0;//Dispose to transparent black background for Tran buffer.
						}else{//24-bit will used reserved RGB transparent color
							this.bufTran[bufI + chanI] = this.reservedTransColor[chanI];
						}
					}
				}
				bufI += this.byteStreamMode;
			}
		}
	
	}else{//==================== End if Custom Byte Stream =========================
		
		datB64 = this.encoderCanvas.toDataURL('image/'+this.sourceFormat,parseFloat(this.quality));
		raw8 = this.string2uint8(atob(datB64.substring(22)));
		upd8 = new Uint8Array(new ArrayBuffer(raw8.length*1.05));//add some extra space to hold things like frame sequence count and fcTL chunks.
		
		//Skip:
		//(1) 0x89
		//(3) PNG
		//(4) CRLF, EOF, UnixLineFeed
		seekPos = 8;
		var endIDAT;
		var startIDAT = 0;//0 evaluates false for not set.
		var is_fdAT = this.payloads.length;//only the first IDAT,
			//or contiguous stream of IDATs will stay IDAT,
			//the rest will be Animated PNG fdAT chunks
		var crc;
		while(seekPos<raw8.length){
			chunkSig = String.fromCharCode.apply(null,raw8.subarray(seekPos+4,seekPos+8));
			chunkLen = raw8[seekPos]*0x1000000+raw8[seekPos+1]*0x10000+raw8[seekPos+2]*0x100+raw8[seekPos+3];//Big Endian
			//alert('chunk: '+chunkSig+' len: '+chunkLen);
			if(chunkSig == 'IDAT'){
				if(!startIDAT //if startIDAT is 0 due to starting at position 0 (first IDAT in sequence of IDATs)
					&& this.frames.length > 1 //At least one frame to be an Animated PNG
					){
					startIDAT=seekPos;
					//fcTL chunk needed for each animation frame
					//only one fcTL, though there maybe multiple contiguous fdAT following.
					GraFlicEncoder.writeUint32(upd8,26,upd8_pos,false);//length
					GraFlicEncoder.writeFourCC(upd8,'fcTL',upd8_pos+4);
					GraFlicEncoder.writeUint32(upd8,this.frameSequenceCount,upd8_pos+8,false);
					GraFlicEncoder.writeUint32(upd8,frameFinalW,upd8_pos+12,false);//width
					GraFlicEncoder.writeUint32(upd8,frameFinalH,upd8_pos+16,false);//height
					GraFlicEncoder.writeUint32(upd8,frameFinalX,upd8_pos+20,false);//x
					GraFlicEncoder.writeUint32(upd8,frameFinalY,upd8_pos+24,false);//y
					GraFlicEncoder.writeUint16(upd8,frameDelay,upd8_pos+28,false);//Numerator (16-bit uint)
					GraFlicEncoder.writeUint16(upd8,1000,upd8_pos+30,false);//Denominator (16-bit uint)
					upd8[upd8_pos+32] = 0x00;//Disposal. 0=none, 1=background, 2=previous
					upd8[upd8_pos+33] = browserEncodedBlending;//Blending. 0=source, 1 = over
					GraFlicEncoder.writeUint32(upd8,GraFlicEncoder.getCRC32(upd8,upd8_pos+4,upd8_pos+34),upd8_pos+34,false);
					upd8_pos += 38;
					this.frameSequenceCount++;
				}
				//there CAN and WILL be images with multiple IDATs.
				//Combine them together. IDATs must be right after eachother according to the spec.
				//will have to cycle thru, change IDAT to fdAT on frames after the first,
				//and recalculate CRC
				
				var copyEnd;
				var destOffset;
				var sourceOffset;
				if(is_fdAT){
					GraFlicEncoder.writeUint32(upd8,chunkLen+4,upd8_pos,false);//extra 4 to store frameSeqCount
					GraFlicEncoder.writeFourCC(upd8,'fdAT',upd8_pos+4);//overwrite 'IDAT' with 'fdAT'
					GraFlicEncoder.writeUint32(upd8,this.frameSequenceCount,upd8_pos+8,false);//fdAT needs a uint32 to store frameSequenceCount
					copyEnd = 8+chunkLen;
					destOffset = upd8_pos+12;//destination start point.
					sourceOffset = seekPos+8;
					for(i=0;i<copyEnd;i++){//copy everything over starting after length, FourCC, and FrameSequenceCount.
						//Source starts after Length and FourCC.
						upd8[destOffset+i] = raw8[sourceOffset+i];
					}
					//The CRC must be recalculated to cover 'fdAT' and the frame sequence number.
					GraFlicEncoder.writeUint32(upd8,GraFlicEncoder.getCRC32(upd8,upd8_pos+4,upd8_pos+8+chunkLen),upd8_pos+12+chunkLen,false);//Must expand range to get the CRC over the FourCC and the extra 4 for the added FrameSequenceCount.
					this.frameSequenceCount++;
					upd8_pos += chunkLen+16;//must be 4 longer here to hold the FrameSequenceCount
				}else{
					copyEnd = 12+chunkLen;
					destOffset = upd8_pos;
					sourceOffset = seekPos;
					for(i=0;i<copyEnd;i++){//copy everything, including length, FourCC, and CRC.
						upd8[destOffset+i] = raw8[sourceOffset+i];
					}
					upd8_pos += chunkLen+12;
				}
			}else{
				//the first non-IDAT chunk after IDATs start appearing
				//will be the end of the contiguous stream of IDATs
				if(startIDAT){endIDAT=seekPos;}
			}
			seekPos += chunkLen+12;//skip length, FourCC, and CRC
		}
		//if(is_fdAT){
			//fdAT frames after the first must be altered to have fdAT instead of IDAT,
			//and include the fcTL and a sequence number starting in the data on each fdAT
			this.payloads.push(upd8.subarray(0,upd8_pos));

		//}else{
		//	this.payloads.push(raw8.subarray(startIDAT,endIDAT));
		//	alert('adding payload from '+startIDAT+' to '+endIDAT);
		//	//include FourCC and length itself (8)
		//}
		//alert('adding payload from '+startIDAT+' to '+endIDAT);
		//alert('end of png chunks');
		}//===================== End if Browser-supplied Byte Stream ======================
	}//====================END PNG============================
	//########################### WEBP #######################
	if(this.sourceFormat=='webp'){
		datB64 = this.encoderCanvas.toDataURL('image/'+this.sourceFormat,parseFloat(this.quality));
		raw8 = this.string2uint8(atob(datB64.substring(23)));
		//alert('...wat');
		seekPos = 12;
		//raw8 = fDat8.subarray(12);//skip RIFF<uint32>WEBP
			//note that WEBP ASCII signature has no length after it, the length before it is for the whole file(except RIFF<uint32>).
		//alert('...');
		while(seekPos<raw8.length){
			//Find and extract the VPX data stream
			//it will start with a signature like 'VP8 ', 'VP8L'
			chunkSig = String.fromCharCode.apply(null,raw8.subarray(seekPos+0,seekPos+4));
			chunkLen = raw8[seekPos+7]*0x1000000+raw8[seekPos+6]*0x10000+raw8[seekPos+5]*0x100+raw8[seekPos+4];//Little Endian
		
			//alert('chunk: '+chunkSig+' len: '+chunkLen);
			if(chunkSig.match(/^VP[0-9]+/)){
				this.payloads.push(raw8.subarray(seekPos,seekPos+chunkLen+8));//include FourCC and length itself (8)
				//alert('adding '+(chunkLen+8)+'-byte payload');
				break;
			}
			seekPos+=chunkLen+8;
		}
	}//=================END WEBP===================
	//################## GIF ######################
	if(this.sourceFormat=='gif'){
		//NOTE: toDataURL('image/gif') is currently ONLY supported in Safari,
			//so not much point to this yet.
		//skip:
		//GIF89a (6bytes)
		//Logical Screen Descriptor (7)
		//Global Color Table (768)
		while(seekPos<raw8.length){
			seekPos += 1000;
		}
	}
	
	this.frameBeingProcessed++;
	//alert(this.sourceFormat+' bitstream packed for frame '+this.frameBeingProcessed+' of '+this.frames.length);
	if(this.onProgress){
		//allow devs to create a progress bar to show the image is being built
		//by setting up this function which accepts a float of 0.0-1.0
		//half of the progress will be tracked in writing the octet stream,
		//the other half here, building payloads.
		this.progress += this.progressPerFrame;
		this.progress = Math.min(this.progress, 1);
		this.onProgress(this.progress);
	}
	if(this.frameBeingProcessed<this.frames.length){
		//put a delay between each frame because image encoding
		//can be very resource hungry, even with the browsers
		//native or even hardware-accelerated encoding.
		setTimeout(function(){this_this.procFrame();},100);
	}else{//all frame bitstreams encoded and ready to be packed into file.
		setTimeout(function(){this_this.packAnimatedFile();},100);
	}
};
GraFlicEncoder.prototype.saveAnimatedFile = function(){
	if(this.onProgress){this.onProgress(0);}//Make sure any progress displays are starting at 0%.
	this.outputString = '';//(deprecated)intermediate state before base64 conversion can be done.
	this.payloads = [];
	this.frameBeingProcessed = 0;
	
	if(!this.retainPastOutput && this.output){//Clean up the previous data if re-encoding.
		URL.revokeObjectURL(this.output);
	}

	this.sourceFormat = this.format;//in most cases these are the same.
	if(this.format == 'webm'){
		this.sourceFormat = 'webp';
	}
	if(this.format == 'png'){
		this.frameSequenceCount = 0;//Animated PNG needs this.
	}
	
	//===============Auto-Detect Image Size====================
	/*
	.width and .height have been moved to .outputWidth and .outputHeight due to a conflict with setting
	the desired .width/.height attributes. These need to be 2 different sets of variables due to the conflict.
	outputWidth/outputHeight is what is used for the actual width/height of the image,
	and it will be the same if .width and .height are set. If width and height are not set, it is auto-calculated.
	It will now make it a set size if .width and .height are set, and auto otherwise.
	If .autoDimensions is is set to true, .width/.height will be ignored and treated as not set.
	That is useful for software that has width height parameters, but can toggle auto dimensions on/off/
	*/
	if(this.width && this.height && !this.autoDimensions){
		//string values from textfields can cause these to not function right as numbers.
		this.outputWidth = parseInt(this.width);
		this.outputHeight = parseInt(this.height);
	}else{//autoDim will need to expand to fit all images.
		this.outputWidth = 1;
		this.outputHeight = 1;
		//alert('autoDim updated from '+this.outputWidth+'x'+this.outputHeight+' ...');
		for(var f=0;f<this.frames.length;f++){
		//.naturalWidth/Height must be used to get the actual image size, NOT an html or styling that may be undefined.
			this.outputWidth  = Math.max(this.frames[f].image.naturalWidth,this.outputWidth);
			this.outputHeight = Math.max(this.frames[f].image.naturalHeight,this.outputHeight);
			
			//alert('...to '+this.outputWidth+'x'+this.outputHeight);
		}
	}
	
	//set up number code to avoid string compares in heavily cycled code.
	if(typeof this.dithering === 'number'){
		this.ditheringCode = this.dithering;
	}else{
		this.ditheringCode = 1;//1 for pattern
		if(this.dithering == 'none'){this.ditheringCode = 0;}
	}
	
	//Note that webp will process through as a an Animated WEBP would even if it just has one frame
	//there are additional features that may be added later that will need this extracting and rebuilding process:
	//Insert EXIF or XMP Metadata,
	//or if toDataURL ever supports webp lossless,
	//possibly do quantization and dithering.
	
	this.progress = 0;
	this.procFrameStage = 0;//0 for final(there can be other stages like 100 for color counting.)
	this.progressPerFrame = 1 / this.frames.length;
	if(this.generateBase64){//Deprecated, legacy.(Although some things like bitmap embeds in SVG use base64, so it might stay)
		this.progressPerFrame /= 2;
	}
	
	//wipe palette if left over
	if(this.paletteLimit){delete this.paletteLimit;}
	if(this.palette){delete this.palette;}
	if(this.paletteExactMatch){delete this.paletteExactMatch;}
	if(this.paletteTransI){delete this.paletteTransI;}
	
	if(this.customByteStream){delete this.customByteStream;}
	if(this.hasTransparency){delete this.hasTransparency;}
	
	this.buildDithMasksV2();
	
	//initialize things that some formats need.
	if(this.format == 'png'){
		//The percentage of total pixels in the image this color represents will be tied to the quality level, for example:
		//quality level 0, the color must represent 1 in 1000 (0.1%) pixels for the quantization to be skipped on it.
		//quality level 0.90, the color must represent 1 in 10000 (0.01%) pixels
		//quality level 0.75, the color must represent 1 in 4000 (0.025%) pixels
		//quality level 0.5, the color must represent 1 in 2000 (0.05%) pixels
		//quality level 0.25, the color must represent 1 in 1333 (0.075%) pixels
		//quality level 1, the threshold to quantize would be 0, and never reached, but quantization is skipped for full quality anyways.
		this.quantThresh = this.outputWidth * this.outputHeight * this.frames.length * 0.001 * (1 - this.quality);
		this.initColorCounting();
		if(window.pako || window.Zopfli){//Needs deflate functionality to take full advantage of color counting.
			//Even if it is 100% quality, it needs to count colors,
			//otherwise it might have <= 256 colors but still get put
			//as RGBA/RGB when only needing indexed and be sub-optimal.
			this.procFrameStage = 100;//100 for color counting
			this.progressPerFrame /= 2;//it will have twice as many, because it now has two stages of processing.
		}else{
			if(this.quality < 1){
				this.procFrameStage = 100;//100 for color counting
				this.progressPerFrame /= 2;//2 stages of processing.
			}/*else{
				//Skipping the color counting only the old way of using the IDAT extracted from the toDataURL,
				//and only when at 100% quality, because otherwise it needs to count extremely common colors,
				//and have them override the quantization.
				//Force full quality to do the last frame only on counting so that it hits the logic for byte stream mode selection.
				//TODO: Might want to break mode selection into a separate stage code for this purpose.
				V--Do not do this, it can end up with a color count that only sampled the last frame --V
				this.frameBeingProcessed = this.frames.length - 1;
			}*/
		}
		if(this.pngOpts){delete this.pngOpts;}
		if(this.png){//If PNG-specific tweaks were set.
			//copy into a new object with every variable set to something in proper type.
			var pngOpts = {};
			pngOpts.disposeNone       = this.png.disposeNone       === undefined ? true : this.png.disposeNone == true;
			pngOpts.disposeBackground = this.png.disposeBackground === undefined ? true : this.png.disposeBackground == true;
			pngOpts.disposePrevious   = this.png.disposePrevious   === undefined ? true : this.png.disposePrevious == true;
			if(this.png.palette && ( window.pako || window.Zopfli ) ){
				this.palette = this.png.palette;
			}
			//Leave whatever object was sent as a parameter as it is, then have the optimized version live.
			this.pngOpts = pngOpts;
		}
		//TODO: Option to force 24-bit or 32-bit mode?
		if(this.palette){
			this.procFrameStage = 0;//Preset colors already selected, skip color counting.
			this.frameBeingProcessed = 0;
			this.progressPerFrame = 1 / this.frames.length;
			this.paletteTransI = 0;
			this.paletteExactMatch = [];
			this.hasTransparency = 0;
			var pA, pR, pG, pB;
			for(var p = 0;p < this.palette.length;p++){
				pA = this.palette[p] >> 24 & 0xFF;
				pR = this.palette[p] >> 16 & 0xFF;
				pG = this.palette[p] >> 8 & 0xFF;
				pB = this.palette[p] & 0xFF;
				if(!pA){//Find the transparent color
					this.paletteTransI = p;
					this.hasTransparency = Math.max(this.hasTransparency, 1);
				}else if(pA < 0xFF){
					this.hasTransparency = 2;
				}
				if(this.paletteExactMatch[pA] === undefined){this.paletteExactMatch[pA] = [];}
				if(this.paletteExactMatch[pA][pR] === undefined){this.paletteExactMatch[pA][pR] = [];}
				if(this.paletteExactMatch[pA][pR][pG] === undefined){this.paletteExactMatch[pA][pR][pG] = [];}
				this.paletteExactMatch[pA][pR][pG][pB] = true;
			}
			this.customByteStream = true;
			this.byteStreamMode = 1;
			this.initBuffersPNG();
		}
	}
	//Allow timeout for the progress display to visually reset if needed without the visual jerking back.
	var this_this = this;//works around access bugs with 'this'
	setTimeout(function(){this_this.procFrame();}, 100);//begin the save process.
};

GraFlicEncoder.prototype.packAnimatedFile = function(){
	var outputLen = 0;
	var out8;
	var i, key, meta;
	var chunkSig;
	var numVal;
	var writePos = 0;
	var savePos = 0;
	var payload;
	var p;
	var frameDelay;//if frame delay logic is being done here rather than elsewhere
	//(NOTE: webp/webm may need logic to swap out VP8 for VP9/VP10, etc
	//if it is detected that through a browser update, this has become
	//the output of Canvas.toDataURL('webp'))
	//===============================WEBP==================================
	if(this.format == 'webp'){
		outputLen += 12;//RIFF,uint32,WEBP
		outputLen += 18;//VP8X extension chunk needed for animation
		if(this.frames.length > 1){//If Animated WEBP, not just one frame.
			outputLen += 14;//ANIM global animation parameters needed
		}
		
		//for(i=0;i<1;i++){
		for(i=0;i<this.payloads.length;i++){
			if(this.frames.length > 1){//If Animated WEBP, not just one frame.
				outputLen += 24;//ANMF chunk needed for each frame
			}
			outputLen += this.payloads[i].length;
			//alert('payload['+i+'] has: '+this.payloads[i].length);
		}
		//alert('creating target octet with size: '+outputLen);
		out8 = new Uint8Array(new ArrayBuffer(outputLen));
		
		GraFlicEncoder.writeFourCC(out8,'RIFF',0);
		GraFlicEncoder.writeUint32(out8,outputLen-8,4,true);
		GraFlicEncoder.writeFourCC(out8,'WEBP',8);
		
		GraFlicEncoder.writeFourCC(out8,'VP8X',12);
		GraFlicEncoder.writeUint32(out8,10,16,true);//length of contents (not including VP8X & length)
		//out8[20] = 0x00;//testing VP8X without animation
		if(this.frames.length > 1){//If Animated WEBP
			out8[20] = 0x02;//packed field, just set animation bit on, alpha bit is hint only and alpha not currently working in canvas.toDataURL('image/webp') as of early 2016 anyways
		}else{//if single frame WEBP
			out8[20] = 0x00;
		}
		GraFlicEncoder.writeUint24(out8,0,21,true);//reserved bits that should be 0
		GraFlicEncoder.writeUint24(out8,this.outputWidth-1,24,true);//width-1
		GraFlicEncoder.writeUint24(out8,this.outputHeight-1,27,true);//height-1
		writePos += 30;
		
		if(this.frames.length > 1){//A single frame WEBP with animation chunks could cause breakage and the chunks are not needed in that case
			GraFlicEncoder.writeFourCC(out8, 'ANIM', writePos + 0);
			GraFlicEncoder.writeUint32(out8, 6, writePos + 4, true);//length of contents (not including ANIM & length)
			GraFlicEncoder.writeUint32(out8, 0x00000000, writePos + 8, true);//BGColor RGBA, just setting to 0x00000000, the viewer can and does seem to ignore this.
			GraFlicEncoder.writeUint16(out8, this.loops, writePos + 12, true);
			writePos += 14;
		}
		//writePos = 30;
		//writePos = 12;
		//for(i=0;i<1;i++){//testing with a simple WEBP
		for(i=0;i<this.payloads.length;i++){
			payload = this.payloads[i];
			if(this.frames.length > 1){//A single frame WEBP with animation chunks could cause breakage and the chunks are not needed in that case
				GraFlicEncoder.writeFourCC(out8,'ANMF',writePos);
				GraFlicEncoder.writeUint32(out8,16+payload.length,writePos+4,true);//length of ANMF (which INCLUDES a VP8/VP8L chunk at the end of it contained within the ANMF)
				GraFlicEncoder.writeUint24(out8,0,writePos+8,true);//x
				GraFlicEncoder.writeUint24(out8,0,writePos+11,true);//y
				GraFlicEncoder.writeUint24(out8,this.outputWidth-1,writePos+14,true);//width-1
				GraFlicEncoder.writeUint24(out8,this.outputHeight-1,writePos+17,true);//height-1
				frameDelay = this.delay;//delay in milliseconds (remember 0 is valid)
				if(this.frames[i].delay !== undefined){frameDelay=this.frames[i].delay;}//use frame-specific delay if set.
				GraFlicEncoder.writeUint24(out8,frameDelay,writePos+20,true);//duration (milliseconds)
				out8[writePos+23]= 0x00;//1 byte here can be skipped (left all 0)
					//6 reserved bits and alphablend/dispose which are not usable with the only option of full frame updates (no way of giving frame back references in toDataURL)
				writePos += 24;
			}//end if has multiple frames(is Animated WEBP)
			for(p=0;p<payload.length;p++){
				out8[writePos+p] = payload[p];
			}
			writePos += payload.length;
		}
		
	}//============================== END WEBP ==============================
	/*if(this.format == 'webm'){}//placeholder was here, not currently supported*/

	if(this.format == 'png'){
		var crc32;
		outputLen += 8;//Header & Magic Number
		outputLen += 25;//IHDR (whole chunks include length,sig,data,CRC)
		if(this.frames.length > 1){//Must have 2+ frames to be Animated PNG (Check frames not payloads, payloads do not get built until after this.)
			//do not output Animated PNG chunks if not needed.
			//there are a few websites or software that
			//might reject these chunks as unknown chunks and exit,
			//even though custom chunks are allowed and
			//the spec says just to ignore them not to fail.
			outputLen += 20;//acTL
		}
		for(i=0;i<this.payloads.length;i++){
			outputLen += this.payloads[i].length;
			//alert('payload['+i+'] has: '+this.payloads[i].length);
		}
		outputLen += 12;//IEND (empty chunk);
		if(this.ppi || this.ppm){//pHYs is optional
			outputLen += 21;//pHYs
		}
		if(this.metadata === false){
			meta = false;//Block all metadata to save bytes.
		}else{//If undefined, it will insert default metas.
			meta = {};
			if(this.metadata){
				for(key in this.metadata){
					//make a separate copy so that things don't happen like like 'Creation Time' getting stuck in memory, creating an invalid timestamp.
					meta[key] = this.metadata[key];
				}
			}
			if(!meta.Software){//Default Software string if not overridden.
				meta.Software = " GraFlic.com AnimatedPNGs.com ";
			}
			if(!meta['Creation Time']){
				meta['Creation Time'] = new Date().toUTCString();//Method most likely to get recommended RFC 1123 string for PNG.
			}
			//Do not attempt to set 'Source' device. userAgent is deprecated and there is no reliable detection.
		}
		var tempKey;
		if(meta){
			//meta should be able to adapt to other formats for example
			//if WEBP might store standard things like author in the EXIF o XMP
			//TODO: store other params like encoding, compression for the metas?
			//TODO: iTXt and multibyte string handling could be added.
			//Put metadata into tEXt chunks.
			for(key in meta){
				var nonASCII = false;
				if((typeof meta[key]) == 'string'){
					tempKey = 'temp_' + key;
					if(  (key + meta[key]).match(/^[\x00-\x7F]+$/) ){
						//same number of bytes as chars, ASCII (or non-standard codepage that will have 0x80+ discarded or truncated)
						meta[tempKey] = key + String.fromCharCode(0) + meta[key];
						//insert single null separator between key and content
					}else{
						//multibytes per char, UTF
						nonASCII = true;
						meta[tempKey] = key + String.fromCharCode(0, 0, 0);
						//NULL(separator)
						//NULL(compression flag off)
						//NULL(default DEFLATE)
						if(this.locale){
							meta[tempKey] += this.locale;
						}else if(window.navigator.language){
							meta[tempKey] += window.navigator.language;
						}//otherwise, iTXt Lang can be unspecified(empty string) if not detected.
						//NULL(sep)
						//(Empty skipped translated keyword. Standard keywords should be automatically recognized and translated by decoders.)
						//TODO: Allow an array of Keyword/TranslatedKeyword mapping? Would rarely be used.
						//NULL(sep)
						meta[tempKey] += String.fromCharCode(0, 0) + meta[key];
					}
					meta[tempKey] = GraFlicEncoder.stringToBytesUTF8(meta[tempKey]);
					meta[tempKey].nonASCII = nonASCII;
					outputLen += 12 + meta[tempKey].length;
				}
			}
		}
		if(this.palette){
			outputLen += 12 + this.palette.length * 3;//PLTE chunk, 3 bytes per color 
			outputLen += 12 + this.palette.length;//tRNS chunk, 1 byte per color
		}
		if((this.hasTransparency || this.frames.length > 1) && this.byteStreamMode == 3){//Will need transparent for recycling if multi-frame.
			outputLen += 18 ;//tRNS chunk, + 6 bytes for deep color 2-byte-per-channel RGBA
		}
		//The length has been calculated. Now allocate the space and write it.
		out8 = new Uint8Array(new ArrayBuffer(outputLen));
		//for(i=0;i<out8.length;i++){
		//	out8[i] = 0x50;//fill with 'P' to see if there are errors writing when viewed from text editor.
		//}
		//PNG always starts with a series of set codes
		out8[0] = 0x89;//set high bit, to not be interpreted as text, 10001001
		out8[1] = 0x50;//P
		out8[2] = 0x4E;//N
		out8[3] = 0x47;//G
		out8[4] = 0x0D;//CR
		out8[5] = 0x0A;//LF
		out8[6] = 0x1A;//End of File
		out8[7] = 0x0A;//Unix LF
		//IHDR Header Chunk
		GraFlicEncoder.writeUint32(out8,13,8,false);//IHDR length (Counts data only, not FourCC or CRC)
		GraFlicEncoder.writeFourCC(out8,'IHDR',12);
		GraFlicEncoder.writeUint32(out8,this.outputWidth,16,false);//width
		GraFlicEncoder.writeUint32(out8,this.outputHeight,20,false);//height
		out8[24] = 0x08;//bit depth, 8 bits per color channel.
		if(this.palette){
			out8[25] = 0x03;//Packed field. color(0x2) and palette(0x1) bits set, 00000011
		}else{
			if(this.byteStreamMode == 4){
				out8[25] = 0x06;//Packed field. color(0x2) and alpha(0x4) bits set, 00000110
			}else{
				out8[25] = 0x02;//Packed field. Only color(0x2) bit set, 00000010
			}
		}
		out8[26] = 0x00;//Compression Mode, 0=DEFLATE, the only defined type
		out8[27] = 0x00;//Filter Mode, 0=Adaptive, the only defined type
		out8[28] = 0x00;//Interlace Method, 0=No interlacing.
		crc32 = GraFlicEncoder.getCRC32(out8,12,29);
		GraFlicEncoder.writeUint32(out8,crc32,29,false);//CRC calculated over Data AND FourCC.
		
		writePos += 33;
		
		//optional pHYs, if ppi or ppm is specified 
		//1 inch is 0.0254 metres. The X/Y in pHYs is metre-based. ('meter' in the US)
		//X and Y could potentially be different for 'non-square' pixels, but that is an odd case, so not currently supporting.
		if(this.ppi || this.ppm){
			var ppm;
			if(this.ppm){
				ppm = this.ppm;
			}else{
				var inch2Meter = 1 / 0.0254
				ppm = this.ppi * inch2Meter;
			}
			GraFlicEncoder.writeUint32(out8, 9, writePos,false);
			GraFlicEncoder.writeFourCC(out8, 'pHYs', writePos + 4);
			GraFlicEncoder.writeUint32(out8, ppm, writePos + 8, false);//X pixels per unit
			GraFlicEncoder.writeUint32(out8, ppm, writePos + 12, false);//Y pixels per unit
			out8[writePos + 16] = 0x01;//Unit type 1 for meter, 0 for unknown.
			GraFlicEncoder.writeUint32(out8, GraFlicEncoder.getCRC32(out8, writePos + 4, writePos + 17), writePos + 17,false);
			writePos += 21;
		}//end if has pHYs

		if(meta){
			for(key in meta){
				var mItem = meta[key];
				//Check that it is string. An object could be used to represent advanced meta like a thumbnail.
				if((typeof mItem) == 'string'){//checking the original meta entry, not the temp_ with the BytesUTF8 conversion done.
					//The whole tEXt/iTXt payload has bee pre-escaped into %XX for ALL chars.
					tempKey = 'temp_' + key;
					GraFlicEncoder.writeUint32(out8,
						meta[tempKey].length,
						writePos, false);
					//iTXt needed for char ranges > 0x7F
					GraFlicEncoder.writeFourCC(out8, meta[tempKey].nonASCII ? 'iTXt' : 'tEXt', writePos + 4);
					savePos = writePos + 4;//needed for CRC
					writePos += 8;
					GraFlicEncoder.writeUbytes(out8, meta[tempKey], writePos);
					writePos += meta[tempKey].length
					/*var strOctets = meta['temp_' + key].substring(1).split('%');//2-char hex strings
					for(i = 0;i < strOctets.length;i++){//Write text string
						//Write the bytes that will represent UTF-8 or ASCII to the octet-stream.
						//Will assume standard ASCII or UTF-8 was entered. Most situations will not do anything else.
						out8[writePos] = parseInt(strOctets[i], 16);
						writePos++;
					}*/
					GraFlicEncoder.writeUint32(out8, GraFlicEncoder.getCRC32(out8, savePos, writePos), writePos, false);
					writePos += 4;
					delete meta[tempKey];
				}
			}
		}

		if(this.palette){
			GraFlicEncoder.writeUint32(out8, this.palette.length * 3, writePos, false);
			GraFlicEncoder.writeFourCC(out8, 'PLTE', writePos + 4);
			savePos = writePos + 4;
			writePos += 8;
			for(i = 0;i < this.palette.length;i++){
				out8[writePos    ] = this.palette[i] >> 16 & 0xFF;
				out8[writePos + 1] = this.palette[i] >> 8 & 0xFF;
				out8[writePos + 2] = this.palette[i] & 0xFF;
				writePos += 3;
			}
			GraFlicEncoder.writeUint32(out8, GraFlicEncoder.getCRC32(out8, savePos, writePos), writePos,false);
			writePos += 4;
			
			//Now write tRNS, which must be after PLTE and come before IDAT.
			GraFlicEncoder.writeUint32(out8, this.palette.length, writePos,false);
			GraFlicEncoder.writeFourCC(out8, 'tRNS', writePos + 4);
			savePos = writePos + 4;
			writePos += 8;
			for(i = 0;i < this.palette.length;i++){
				out8[writePos] = this.palette[i] >> 24 & 0xFF;
				writePos ++;
			}
			GraFlicEncoder.writeUint32(out8, GraFlicEncoder.getCRC32(out8, savePos, writePos), writePos, false);
			writePos += 4;
		}
		if((this.hasTransparency || this.frames.length > 1) && this.byteStreamMode == 3){//Will need transparent for recycling if multi-frame.
			//Now write tRNS, which must come before IDAT.
			//For 24-bit RGB, it is a different format. Write the R,G,B values reserved as the transparent color as 16-bit unsigned integers.
			GraFlicEncoder.writeUint32(out8, 6, writePos,false);
			GraFlicEncoder.writeFourCC(out8, 'tRNS', writePos + 4);
			savePos = writePos + 4;
			writePos += 8;
			out8[writePos]     = 0;//Big-Endian, 2 bytes per channel RGB to be able to hold deep color (Though only 1-byte channel RGB is used).
			out8[writePos + 1] = this.reservedTransColor[0];
			out8[writePos + 2] = 0;
			out8[writePos + 3] = this.reservedTransColor[1];
			out8[writePos + 4] = 0;
			out8[writePos + 5] = this.reservedTransColor[2];
			writePos += 6;
			GraFlicEncoder.writeUint32(out8, GraFlicEncoder.getCRC32(out8, savePos, writePos), writePos,false);
			writePos += 4;
		}
		
		if(this.payloads.length > 1){//At least one frame to be an Animated PNG
			//do not output Animated PNG chunks if not needed.
			//writePos = 33;//would be 33 with no acTL
			GraFlicEncoder.writeUint32(out8, 8, writePos, false);
			GraFlicEncoder.writeFourCC(out8, 'acTL', writePos + 4);
			GraFlicEncoder.writeUint32(out8, this.payloads.length, writePos + 8, false);//Number of frames.
			GraFlicEncoder.writeUint32(out8, this.loops, writePos + 12, false);//Loops. 0 for infinite.
			GraFlicEncoder.writeUint32(out8, GraFlicEncoder.getCRC32(out8, writePos + 4, writePos + 16), writePos + 16, false);
		
			writePos += 20;
		}//end is more than one frame
		
		//Write each payload that was generated
		for(i=0;i<this.payloads.length;i++){
			payload = this.payloads[i];
			for(p=0;p<payload.length;p++){
				out8[writePos+p] = payload[p];
			}
			writePos += payload.length;
		}
		
		//now close the image with the IEND chunk.
		GraFlicEncoder.writeUint32(out8, 0, writePos, false);//IEND is empty
		GraFlicEncoder.writeFourCC(out8, 'IEND', writePos + 4);
		crc32 = GraFlicEncoder.getCRC32(out8, writePos + 4, writePos + 8);
		GraFlicEncoder.writeUint32(out8, crc32, writePos + 8, false);
	}
	//alert('before outputOctetStream set');
	this.outputOctetStream = out8;
	
	this.output = URL.createObjectURL(
			new Blob([out8], {'type':'image/'+this.format})
			);
	
	//alert('after outputOctetStream set: '+this.outputOctetStream.length);
	if(this.generateBase64){
		this.chunkPackI = 0;
		this.packChunk();
	}else{
		if(this.onEncoded){
			this.onEncoded(this);
		}
	}
	
};
GraFlicEncoder.prototype.packChunk = function(){
	if(this.chunkPackI<this.outputOctetStream.length){
		this.outputString += String.fromCharCode.apply(null,this.outputOctetStream.subarray(this.chunkPackI,Math.min(this.outputOctetStream.length,this.chunkPackI+2048)));
		this.chunkPackI += 2048;
		var this_this = this;//needed to stop breakage.
		setTimeout(function(){this_this.packChunk();},5);//must wrap function this way or it will break variables
		if(this.onProgress){
			//allow devs to create a progress bar to show the image is being built
			//by setting up this function which accepts a float of 0.0-1.0
			//half of the progress will be tracked in building payloads,
			//the other half here, writing the octet stream.
			this.onProgress(0.5+0.5*Math.min(this.chunkPackI/this.outputOctetStream.length,1));
		}
	}else{
		//the base 64 conversion sometimes creating Maximum call stack size exceeded
		//breaking it up so that conversion of each frame is done asynchronously
		//when selected may help so not too much is done in one call
		//it seems to be related to too huge of a value sent to String.fromCharCode.
		this.outputBase64 = 'data:image/'+this.format+';base64,'+btoa(this.outputString);
		//alert('done packing b64: '+this.outputBase64.length);
		if(this.onEncoded){
			//alert('onencoded go');
			this.onEncoded(this);
		}
	}
};
GraFlicEncoder.prototype.string2uint8 = function(str){
	//Note: this function may be flawed. It does not account for high-range UTF cases.
	//It is currently mostly used for converting base64 URL to bytes and does not seem to run into any issues there probably since base64 is encoding a sequence of octets...
	var u8 = new Uint8Array(new ArrayBuffer(str.length));
	for(var i=0;i<str.length;i++){
		u8[i] = str.charCodeAt(i);
	}
	return u8;
};
GraFlicEncoder.writeFourCC = function(out8,chunkSig,pos){
	out8[pos+0] = chunkSig.charCodeAt(0);
	out8[pos+1] = chunkSig.charCodeAt(1);
	out8[pos+2] = chunkSig.charCodeAt(2);
	out8[pos+3] = chunkSig.charCodeAt(3);
};
GraFlicEncoder.readFourCC = function(in8, pos){
	return String.fromCharCode(in8[pos + 0])
	     + String.fromCharCode(in8[pos + 1])
	     + String.fromCharCode(in8[pos + 2])
	     + String.fromCharCode(in8[pos + 3]);
};
GraFlicEncoder.writeUint32 = function(out8,u32,pos,isLittleEndian){
	if(isLittleEndian){
		out8[pos+0] = u32&0xFF;
		out8[pos+1] = u32>>8&0xFF;
		out8[pos+2] = u32>>16&0xFF;
		out8[pos+3] = u32>>24&0xFF;
	}else{
		out8[pos+0] = u32>>24&0xFF;
		out8[pos+1] = u32>>16&0xFF;
		out8[pos+2] = u32>>8&0xFF;
		out8[pos+3] = u32&0xFF;
	}
};
GraFlicEncoder.readUint32 = function(in8, pos, isLittleEndian){
	//These can be static functions they don't need the object ref.
	if(isLittleEndian){
		return in8[pos + 0] | in8[pos + 1] << 8 | in8[pos + 2] << 16 | in8[pos + 3] << 24;
	}else{
		return in8[pos + 0] << 24 | in8[pos + 1] << 16 | in8[pos + 2] << 8 | in8[pos + 3];
	}
};
GraFlicEncoder.writeUint24 = function(out8,u24,pos,isLittleEndian){
	if(isLittleEndian){
		out8[pos+0] = u24&0xFF;
		out8[pos+1] = u24>>8&0xFF;
		out8[pos+2] = u24>>16&0xFF;
	}else{
		out8[pos+0] = u24>>16&0xFF;
		out8[pos+1] = u24>>8&0xFF;
		out8[pos+2] = u24&0xFF;
	}
};
GraFlicEncoder.writeUint16 = function(out8, u16, pos, isLittleEndian){
	if(isLittleEndian){
		out8[pos+0] = u16&0xFF;
		out8[pos+1] = u16>>8&0xFF;
	}else{
		out8[pos+0] = u16>>8&0xFF;
		out8[pos+1] = u16&0xFF;
	}
};
GraFlicEncoder.readUint16 = function(out8, pos, isLittleEndian){
	if(isLittleEndian){
		return out8[pos] | out8[pos + 1] << 8;
	}else{
		return out8[pos] << 8 | out8[pos + 1];
	}
};
GraFlicEncoder.initCRCTable = function(){
	GraFlicEncoder.crcTable = new Uint32Array(256);//this broke when using ArrayBuffer(256), not sure why
	var calc;
	var i;
	var i2;
	//var testStr = '';
	for(i=0x00000000;i<256;i++){
		calc = i;
		for(i2=0;i2<8;i2++){
			if(calc&1){
				calc = ((0xEDB88320) ^ (calc >>> 1));
			}else{
				calc = (calc >>> 1);
			}
		}
		GraFlicEncoder.crcTable[i] = calc;
		//testStr += '\r\n'+calc.toString(16);
	}
	//alert('table at 127: '+GraFlicEncoder.crcTable[127]);
	//alert('crcTable: '+testStr);
};
GraFlicEncoder.getCRC32 = function(u8,startIndex,endIndex){
	//if the CRC table has not been initialized, set it up.
	if(!GraFlicEncoder.crcTable){
		GraFlicEncoder.initCRCTable();
	}
	var i;
	var crc = 0xFFFFFFFF;
	var cIndex;
	//Note that endIndex is actually 1 greater than the last
	//index read (like array loop length logic)
	for(i=startIndex;i<endIndex;i++){
		cIndex = ((crc^(u8[i]))&(0xFF));
		crc = GraFlicEncoder.crcTable[cIndex] ^ (crc>>>8) ;
	}
	//Note that Javascript converts numbers to SIGNED 32 bit ints before
	//doing most bitwise operations.
	//It is still doing the exact same thing in most cases when it comes to
	//manipulating bits, it is just the interpretation of the number
	//that changes (an exception is sign-propogating >> done on a negative)
	//(two's complement would be padded with 1's to the left after shift)
	//(whether signed or unsigned it is still a row of 32 bits)
	return crc ^ 0xFFFFFFFF;
};
GraFlicEncoder.getStringByteLength = function(mbStr){
	//Get the length of a string in bytes, which can be different than number of chars.
	//DEPRECATED. This wastes processing by doing the whole escapeAll process just to return a lenght.
	//Just get the string from escapeAll, divide the length by 3 and compare it to the JS16 string length to see if it has multibyte UTF-8 characters and would need more handling than ASCII.
	return GraFlicEncoder.escapeAll(mbStr).length / 3;//count the '%20' '%AF' etc
};
GraFlicEncoder.escapeAll = function(mbStr){//TODO: If needed allow params for other styles of escaping?
	//%XX encodes ALL characters, even ASCII/URL-reserved and '%'
	mbStr = mbStr.split('');//make character array
	var mbChar, mbRes = '', accumNonASCII = '';
	for(var i = 0;i < mbStr.length;i++){
		//Only charCodeAt not codePointAt is needed. Any non-ASCII will have high bits set, whether a single component or high range char with two 16-bit components in the pair.
		mbChar = mbStr[i].charCodeAt(0);
		if(mbChar < 0x80){
			if(accumNonASCII.length){
				mbRes += encodeURI(accumNonASCII);
				accumNonASCII = '';
			}
			//Escape ASCII char that would be ignored by encodeURI()
			mbRes += '%' + (mbChar < 0x10? '0' : '') + mbChar.toString(16).toUpperCase();
		}else{
			accumNonASCII += mbStr[i];
			//Must encodeURI as it goes. If doing it at the end after all ASCII was escaped, the % of the %XX will get caught in the escapes and break it.
			//JS uses UTF-16 for strings. 
			//Only do the encodeURI to the remaining buffer at the end and before an ASCII is encountered. If trying to encodeURI on each char, that 16-bit char may be part of a 2-component sequence of chars that form together to make a high range UTF char. In that case it will be and error if attempted without the other part of the set.
		}
		/*else{
			mbChar = String.fromCodePoint(mbChar);
			mbRes += mbChar;
			if(mbChar.length > 1){i++;}
		}*/
		
		/*else if(mbChar < 0xD800 || mbChar > 0xDFFF){
			mbRes += String.fromCharCode(mbChar);
		}else{
			//D800 - DFFF are reserved and used to signal that another 16-bit component follows and combines with this one to make a high-range character.
			//Advance to the next 16-bit char and combine it with the high component.
			mbRes += String.fromCodePoint(mbStr.codePointAt(i));
			i++;//Skip one because this was a multi-component character.
		}*/
	}
	if(accumNonASCII.length){
		mbRes += encodeURI(accumNonASCII);
	}
	return mbRes;
};
GraFlicEncoder.stringToBytesUTF8 = function(str){
	//Converts a string to a Uint8Array that is UTF-8 format and suitable for writing into binary and files.
	str = GraFlicEncoder.escapeAll(str);
	//(first remove first '%' and split to get the UTF-8 octet hex codes in an array)
	str = str.substring(1).split('%');
	var strBytesUTF8 = new Uint8Array(new ArrayBuffer(str.length));
	for(var i = 0;i < str.length;i++){
		strBytesUTF8[i] = parseInt(str[i], 16);//Write the Hex sting as binary byte for each escaped UTF-8 byte.
	}
	return strBytesUTF8;
};
GraFlicEncoder.writeUbytes = function(out8, bytesU8, pos){
	//Writes unsigned bytes to a octet stream (Uint8Array)
	//This can be used to write a UTF8 String into a file.
	//To do this, first call stringToBytesUTF8 to get the bytes to send here.
	//Do that first so that the length in bytes of the string can be noted.
	//That usually has to be done first earlier in the logic to allocate the correct Uint8Array size for the file.
	for(var i = 0;i < bytesU8.length;i++){
		out8[pos + i] = bytesU8[i];
	}
};
GraFlicEncoder.readStringUTF8 = function(out8, pos, sLen){
	//This will read a string out of an octet stream (Uint8Array) at the position for the given length.
	//It will return a String in standard JS format (UTF-16)
	//TODO: Maybe look at future JS String/Encoding classes/support to simplify UTF-8/JS UTF-16 conversion code if they ever become finished and standard.
	var bytesUTF8 = out8.subarray(pos, pos + sLen);
	var strJS16 = '';
	var byte8;
	for(var i =0;i < bytesUTF8.length;i++){
		byte8 = bytesUTF8[i];
		if(byte8 < 0x80){//ASCII range
			if(byte8 == 37){//%, keep it escaped since it could collide with decoding other %## octets.
				strJS16 += '%25';
			}else{
				strJS16 += String.fromCharCode(byte8);//decodeURI() will not decode certain ASCII characters that URLs use, so convert them easily with this before sending to decodeURI.
			}
		}else{
			strJS16 += '%' + byte8.toString(16);//byte > 7F. All multibyte UTF-8 sequences have the high bit set on every byte and will be > 7F for all.
		}
	}
	strJS16 = decodeURI(strJS16);
	return strJS16;
};
GraFlicEncoder.prototype.buildDithMasks = function(){
	var maskSize = this.outputWidth*this.outputHeight*4;
	if(this.outputWidth==this.ditherWidth&&this.outputHeight==this.ditherHeight){return;}//do not need to remake it if it was already done on the same dimensions
	this.ditherWidth = this.outputWidth;//must check these rather than maskSize because 10x20 or 20x10 could be the same maskSize
	this.ditherHeight = this.outputHeight;
	this.ditherMaskSize = maskSize;
	this.dithMaskHalf = [];//new Uint8Array(new ArrayBuffer(maskSize));
	this.dithMaskFourth = [];//new Uint8Array(new ArrayBuffer(maskSize));
	//just storing them as bools should be better.
	var dHalf = true;
	//var dFourth;
	var d = 0;
	var evenW = this.outputWidth%2==0;
	//var wFourthAdj = 0;
	for(var h=0;h<this.outputHeight;h++){
		for(var w=0;w<this.outputWidth;w++){
			//dFourth = h%2==(wFourthAdj+w)%2;
			
			//this.dithMaskHalf[d] = dHalf;
			//for(var c=0;c<4;c++){
			//stagger the channels. this should make artifacting less noticeable.
			this.dithMaskHalf[d]   =  dHalf;
			this.dithMaskHalf[d+1] = !dHalf;
			this.dithMaskHalf[d+2] =  dHalf;
			this.dithMaskHalf[d+3] = !dHalf;
			this.dithMaskFourth[d]   = (((h+3)%4==2&&(w  )%4==0) || ((h+3)%4==0&&(w  )%4==2));//dFourth;
			this.dithMaskFourth[d+1] = (((h+2)%4==2&&(w+1)%4==0) || ((h+2)%4==0&&(w+1)%4==2));//dFourth;
			this.dithMaskFourth[d+2] = (((h+1)%4==2&&(w+2)%4==0) || ((h+1)%4==0&&(w+2)%4==2));//dFourth;
			this.dithMaskFourth[d+3] = (((h  )%4==2&&(w+3)%4==0) || ((h  )%4==0&&(w+3)%4==2));//dFourth;
			d+=4;
			dHalf = !dHalf;
		}
		//wFourthAdj++;
		if(evenW){
			dHalf = !dHalf;//toggle it on each new scanline to make checkers.
		}
	}
};
GraFlicEncoder.prototype.buildDithMasksV2 = function(){
	if(this.dithMask){return;}
	//Each greater number represents a value of true for the next level of
	//more sparse dithering. Patterns should always line up with eachother
	//and remove pixels as it gets more sparse so that recycling pixels
	//across frames is effective.
	//0 is always false, 1 is true every other pixel, 2 every 4th, and so on...
	
	this.dithMask = [
		[6, 0, 2, 0, 4, 0, 2, 0],
		[0, 1, 0, 1, 0, 1, 0, 1],
		[2, 0, 3, 0, 2, 0, 3, 0],
		[0, 1, 0, 1, 0, 1, 0, 1],
		[4, 0, 2, 0, 5, 0, 2, 0],
		[0, 1, 0, 1, 0, 1, 0, 1],
		[2, 0, 3, 0, 2, 0, 3, 0],
		[0, 1, 0, 1, 0, 1, 0, 1]
	];
};
GraFlicEncoder.prototype.quant8Octets = function(octets){
		var quant8 = 0;//full quality. no quantization or dithering.
		if(this.quality < 1){
			quant8 = 1;//Not usually much savings, but hard to tell the difference from the full quality.
		}
		if(this.quality <= 0.9){
			quant8 = 2;//Starts saving a good portion usually, and still can be fairly hard to tell from full quality.
		}
		if(this.quality <= 0.8){
			quant8 = 3;//This level has allot of savings and the artifacting can be noticed but is not too bad.
			//This is ideal in many cases. It sometimes even cuts the size in half without much noticeable difference.
		}
		if(this.quality <= 0.7){
			quant8 = 4;//This can save allot of extra file size, the but artifacts really start showing up here.
		}
		if(this.quality <= 0.5){
			quant8 = 5;//The dither artifacting becomes very noticeable here, but it still looks OK in some cases.
				//The size savings are quite good.
		}
		if(this.quality <= 0.3){
			quant8 = 6;//Starts too look quite blocky. It has a color-banding effect even with help from dithering.
			//The size savings are very strong, but the quality is becoming weak at this point.
		}
		if(this.quality <= 0.1){
			quant8 = 7;//Even smaller size and less quality. Heavy artifacting and color banding.
		}
		if(this.quality <= 0){
			quant8 = 8;//Saves more size, but the artifacting and color banding are extreme.
		}
		if(!quant8){return;}//no need to do anything if leaving fully lossless.
		
		
		//quant level 5 and below start getting really ugly fast, so there are bigger ranges there.
		//There are only 8 bits so only full quality and 8 levels of quantization possible with this,
		//so 0-8 is guessed based on the 0.0-1.0 quality number.
		var QUANT_INC = new Uint16Array(9);
		var QUANT_MASK = new Uint8Array(9);
		QUANT_INC[0] = 0x01;//00000001 not quantized(ultimately best quality over all with no savings from quantization)
		QUANT_INC[1] = 0x02;//00000010 best quality quantized
		QUANT_INC[2] = 0x04;//00000100
		QUANT_INC[3] = 0x08;//00001000
		QUANT_INC[4] = 0x10;//00010000
		QUANT_INC[5] = 0x20;//00100000
		QUANT_INC[6] = 0x40;//01000000
		QUANT_INC[7] = 0x80;//10000000
		QUANT_INC[8] =0x100;//00000001 00000000
				//remember if the channel hits 256 when adding the increment,
				//set the channel to 0xFF
				//if just doing &0xFF mask on 0x100, it will get 0!
				
		QUANT_MASK[0] = 0xFF;//11111111
		QUANT_MASK[1] = 0xFE;//11111110
		QUANT_MASK[2] = 0xFC;//11111100
		QUANT_MASK[3] = 0xF8;//11111000
		QUANT_MASK[4] = 0xF0;//11110000
		QUANT_MASK[5] = 0xE0;//11100000
		QUANT_MASK[6] = 0xC0;//11000000
		QUANT_MASK[7] = 0x80;//10000000
		QUANT_MASK[8] = 0x00;//00000000
	var oBits;
	var quantizePixel;
	for(var i=0;i<octets.length;i++){
		if(i % 4 == 0){//Will always be in the canvas 4-byte RGBA format when calling this quantizer.
			quantizePixel = this.getColorCount(octets[i], octets[i + 1], octets[i + 2], octets[i + 3]) < this.quantThresh;
		}
		if(quantizePixel){
			oBits = octets[i];
			var incrementDif = oBits%QUANT_INC[quant8];
			var nChange = incrementDif/QUANT_INC[quant8];
			var roundUp;
			if(this.ditheringCode == 1){//Pattern dithering
				if(nChange>0.375&&nChange<0.625){//value about in the middle
					roundUp = this.dithMaskHalf[i];//?Math.floor(nVal):Math.ceil(nVal);//checkered even split
					//dithOrg[0][dithClr][dithI]? -- old code, maybe expiriment before dropping patterned dith at one point?
				}else if(nChange>0.125&&nChange<=0.375){//value relatively close to lower number
					roundUp = this.dithMaskFourth[i];//return dithAltB?Math.ceil(nVal):Math.floor(nVal);//sparse ceiling
				}else if(nChange>=0.625&&nChange<0.875){//value relatively close to upper number
					roundUp = !this.dithMaskFourth[i];//return dithAltB?Math.floor(nVal):Math.ceil(nVal);//sparse floor
				}else{
					roundUp = Math.round(nChange);
				}
			}else{//No dithering.
				roundUp = Math.round(nChange);
			}
			
			oBits &= QUANT_MASK[quant8];
			if(roundUp){oBits+=QUANT_INC[quant8];}
			if(oBits>0xFF){oBits=0xFF;}
			octets[i] = oBits;
			

			/*
			oBits = octets[i];
			var incrementDif = oBits%QUANT_INC[quant8];
			var nChange = incrementDif/QUANT_INC[quant8];
			var roundUp = nChange > 0.5;
			
			oBits &= QUANT_MASK[quant8];
			if(roundUp){oBits+=QUANT_INC[quant8];}
			if(oBits>0xFF){oBits=0xFF;}
			this.distQuant(octets[i] - oBits, octets, i, i % 4);
			octets[i] = oBits;*/
		}//end if quantize this pixel
	}
};

GraFlicEncoder.prototype.initColorCounting = function(){
	this.colorLookup = [];
	//for(var i = 0;i < 256;i++){//create an array for each potential level of opacity.
	//	this.colorLookup.push([]);
	//}
	//having one array indexed by argb or rgba would be a problem since 32 bit numbers in javascript are signed.
	this.sigColorLookup = [];//Sig color lookup does not have an issue with signed numbers because it will count quantized sectors
				//and will never reach the top values of the uint that could flow into a negative index.
	this.uniqueColors = 0;
	this.sigColors = 0;//Significant colors.
		//Use significant colors count to determine if it needs to go indexed color.
		//Things like gradients can cause it to go into RGBA mode when not optimal
		//if going off of uniqueColors.
	this.significantThresh = Math.max(8,Math.round(this.outputWidth * this.outputHeight * this.frames.length * 0.0004));
};

GraFlicEncoder.prototype.incrementColorCount = function(red, green, blue, alpha){
	//var rgb = red << 16 | green << 8 | blue;
	if(!alpha){
		//Force all fully transparent entries to be exactly the same, causing duplicates to be eliminated.
		//(Although most or all canvas implementations force this anyways via pre-multiplied alpha)
		//(the canvas pre-multiplied alpha may actually be internally used only, and return RGBA values as non-pre-multiplied, but with possible information loss, PNG spec does NOT use premultiplied alpha.)
		//(do it here so that all fully transparent counts are combined)
		red = 0; green = 0; blue = 0;
		//TODO: Should this be done on all colors with transparency? To truncate them at pre-multipled alpha value and prevent duplicates?
	}
	if(this.colorLookup[alpha]){
		if(this.colorLookup[alpha][red]){
			if(!this.colorLookup[alpha][red][green]){
				this.colorLookup[alpha][red][green] = [];
			}
		}else{
			this.colorLookup[alpha][red] = [];
			this.colorLookup[alpha][red][green] = [];
		}
	}else{
		this.colorLookup[alpha] = [];
		this.colorLookup[alpha][red] = [];
		this.colorLookup[alpha][red][green] = [];
	}
	//Now that it has ensured any needed arrays exist, increment it if it exists, otherwise create it.
	if(this.colorLookup[alpha][red][green][blue]){
		this.colorLookup[alpha][red][green][blue]++;
		//if(this.colorLookup[alpha][red][green][blue] == this.significantThresh){
		//	this.sigColors++;//Increment this when given color reaches the significant count level.
		//}
	}else{
		this.colorLookup[alpha][red][green][blue] = 1;
		this.uniqueColors++;
	}
	//Needs to floor, not round (255 / 8 will be 31.875 going on highest index of the 5-bit channel: 11111)
	var sigIndex = alpha / 4 << 15 | red / 4 << 10 | green / 4 << 5 | blue / 4;
	if(this.sigColorLookup[sigIndex]){
		this.sigColorLookup[sigIndex]++;//Note: A simple true false might be enough for this, may want to switch it to that.
		if(this.colorLookup[alpha][red][green][blue] == this.significantThresh){
			this.sigColors++;
		}
	}else{
		this.sigColorLookup[sigIndex] = 1;
	}
};
GraFlicEncoder.prototype.getColorCount = function(red, green, blue, alpha){
	//var rgb = red << 16 | green << 8 | blue;
	//Remember, undefined will evaluate as false.
	if(   this.colorLookup[alpha]
	   && this.colorLookup[alpha][red]
	   && this.colorLookup[alpha][red][green]
	   && this.colorLookup[alpha][red][green][blue]
		){//return count if it exists
		return this.colorLookup[alpha][red][green][blue];
	}
	return 0;//otherwise, return 0.
};
GraFlicEncoder.prototype.getPaletteIndex = function(fData, qData, i, dithW, dithH){
	var red   = fData[i], 
	    green = fData[i + 1],
	    blue  = fData[i + 2],
	    alpha = fData[i + 3];
	var closestVals = this.getClosestColor(red, green, blue, alpha);
	var closestColor = closestVals[0];
	//[A],[R],[G] are arrays, [B] is a value(true) or undefined.
	if( this.paletteExactMatch[alpha]
	 && this.paletteExactMatch[alpha][red]
	 && this.paletteExactMatch[alpha][red][green]
	 && this.paletteExactMatch[alpha][red][green][blue] ){
		//leave it as it is, there was an exact color match.
	}else{
		
		if(Math.abs(red   - closestVals[1])
		 + Math.abs(green - closestVals[2])
		 + Math.abs(blue  - closestVals[3])
		 + Math.abs(alpha - closestVals[4])
				> 4
			){//================= Only check if there is enough difference in color ====================
		var dithRGBA = [];
		
		var dithValue  = this.dithMask[dithH % this.dithMask.length][dithW % this.dithMask[0].length];
		var dithHalf   = dithValue > 0;
		var dithFourth = dithValue > 1;
		var dithEighth = dithValue > 2;
		
		if(!this.ditheringCode){
			//If no dithering, further logic to dither is not needed.
			return closestColor;
		}
		
		for(var c = 0; c < 4; c++){
			var qIncr = 0x20;
			var qMask = 0xE0;
			var incrementDif = fData[i + c] % qIncr;
			var nChange = incrementDif / qIncr;
			var roundUp;
			if(nChange > 0.375 && nChange < 0.625){//value about in the middle
				roundUp = dithHalf;//checkered even split
			}else if(nChange > 0.2 && nChange <= 0.375){//value relatively close to lower number
				roundUp = dithFourth;//sparse ceiling
			}else if(nChange >= 0.625 && nChange < 0.8){//value relatively close to upper number
				roundUp = !dithFourth;//sparse floor
			}else if(nChange > 0.75 && nChange <= 0.2){
				roundUp = dithEighth;//very sparse ceiling
			}else if(nChange >= 0.8 && nChange < 0.925){
				roundUp = !dithEighth;//very sparse floor
			}else{
				roundUp = Math.round(nChange);
			}
			
			dithRGBA.push(fData[i + c] & qMask);
			if(roundUp){dithRGBA[c] += qIncr;}
			if(dithRGBA[c] > 0xFF){dithRGBA[c] = 0xFF;}
		}
		var secondClosestVals = this.getClosestColor(dithRGBA[0], dithRGBA[1], dithRGBA[2], dithRGBA[3]);
			//Don't dither with the next closest color unless it is relatively close,
			//otherwise it hurts both compression and quality.
			//TODO: go over the logic on this, it is a bit wonky.
			if(
			  (Math.abs(closestVals[1] - secondClosestVals[1])
			 + Math.abs(closestVals[2] - secondClosestVals[2])
			 + Math.abs(closestVals[3] - secondClosestVals[3])
			 + Math.abs(closestVals[4] - secondClosestVals[4])
				< 0xFF)//< 65536 / this.palette.length)//32678 16384 8192 4096
			&&
			  (Math.abs(red   - secondClosestVals[1])
			 + Math.abs(green - secondClosestVals[2])
			 + Math.abs(blue  - secondClosestVals[3])
			 + Math.abs(alpha - secondClosestVals[4])
				< 0xFF)//< 65536 / this.palette.length )
				 ){
				closestColor = secondClosestVals[0];
			}
		}//=========== End if enough difference in color ==========
		
	}
	//previous RGBA must be updated so that it can compare with actual pixel drawn
	
	/*
	var closeR = closestVals[1],
	    closeG = closestVals[2],
	    closeB = closestVals[3],
	    closeA = closestVals[4];
	
	
	//do not push errors onto fully transparent pixels, it can cause recycled
	//transparent areas to get spare dots drawn over them
	//(Use closeR/G/B/A, compare actual color being drawn not original value)
	
	//This style of dithering was shifting noise around too much when switching frames, hurting compression and appearence.
	this.distQuant(red   - closeR, qData, i, dithW, dithH, 0);
	this.distQuant(green - closeG, qData, i, dithW, dithH, 1);
	this.distQuant(blue  - closeB, qData, i, dithW, dithH, 2);
	this.distQuant(alpha - closeA, qData, i, dithW, dithH, 3);
	*/
	
	return closestColor;
};
GraFlicEncoder.prototype.getClosestColor = function(red, green, blue, alpha){
	var colorDif;
	var closestColorDif = 0x7FFFFFFF;//Don't go full value, remember JS numbers are 2's complement signed.
	var closestColor = 0;
	
	var closeR, closeG, closeB, closeA;
	var plteR, plteG, plteB, plteA;
	var curColor;
	for(var p = 0; p < this.palette.length; p++){
		curColor = this.palette[p];
		plteA = curColor >> 24 & 0xFF;
		plteR = curColor >> 16 & 0xFF;
		plteG = curColor >> 8 & 0xFF;
		plteB = curColor & 0xFF;
		colorDif =   Math.abs(red - plteR)
			   + Math.abs(green - plteG)
			   + Math.abs(blue - plteB)
			   + Math.abs(alpha - plteA);
		if(colorDif < closestColorDif){
			closestColorDif = colorDif;
			closestColor = p;
			closeR = plteR; closeG = plteG; closeB = plteB; closeA = plteA;
		}
	}
	//Returns an array with the closest color and additional values for the color channels to save from having to recalculate them.
	return [closestColor, closeR, closeG, closeB, closeA];
};
GraFlicEncoder.prototype.distQuant = function(qError, qData, i, dithW, dithH, cOffset){
	//qData is used to track the errors.
	//This is used because some pixels (like exact match with palette)
	//should not accept the quantization error that may have been generated
	//by a close by anti-aliased pixel or something...
	//cOffset is channel offset to slide it over x slots for green, blue, alpha
	if(!qError){return;}//Exit if there is no error to distribute.
	
	var errorFract = 0;
	var errorSeek = 0;
	
	//Distribute quantization errors like this:
	//
	//          [pixel] [7/16]
	//   [3/16] [5/16 ] [1/16]
	if(dithW + 1 < this.outputWidth){
		errorFract = (7/16) * qError;
		errorSeek = 4;
		//if(qData[i + errorSeek + cOffset]){
			qData[i + errorSeek + cOffset] += errorFract;//If undefined and already holds error overflow
		//}else{
		//	qData[i + errorSeek + cOffset] = errorFract;//If undefined
		//}
	}
	if(dithH + 1 < this.outputHeight){
		if(dithW > 1){
			errorFract = (3/16) * qError;
			errorSeek = this.outputWidth * 4 - 4;//scroll down to the next line and one to the left
			//if(qData[i + errorSeek + cOffset]){
				qData[i + errorSeek + cOffset] += errorFract;
			//}else{
			//	qData[i + errorSeek + cOffset] = errorFract;
			//}
		}
		errorFract = (5/16) * qError;
		errorSeek = this.outputWidth * 4;//scroll down to the next line and one to the left
		//if(qData[i + errorSeek + cOffset]){
			qData[i + errorSeek + cOffset] += errorFract;
		//}else{
		//	qData[i + errorSeek + cOffset] = errorFract;
		//}
		if(dithW + 1 < this.outputWidth){
			errorFract = (1/16) * qError;
			errorSeek = this.outputWidth * 4 + 4;//scroll down to the next line and one to the left
			//if(qData[i + errorSeek + cOffset]){
				qData[i + errorSeek + cOffset] += errorFract;
			//}else{
			//	qData[i + errorSeek + cOffset] = errorFract;
			//}
		}
	}
};
GraFlicEncoder.prototype.filterBytePNG = function(buf, i, fMode, x, y, minX, minY, scanWidth){
	//x, y, w, h are the x, y, width and height in pixels regardless of number of bytes per pixel.
	//scanWidth is the width of the full image bounds times the bytes per pixel.
	//(Remember, it is reading from the full-dimensions buffer. And must offset by the full width to get the Up position for example.)
	//Note that this is reading from the full-dimensions buffers, but the result will be written to the buffer for the updated region.
	//This will always read from the buffer that is pre-filter, it would not compare bytes with ones that have been filtered as part of the process.
	//It will always look at the original byte for filter comparison and the write the filtered result to the final byte stream.
	var curByte = buf[i];
	if(fMode == 1){//Sub, subtract byte to the left.
		var subByte = 0;//If on the edge with no pixels to the left it is treated as 0.
		if(x > minX){//Exactly minX is first pixel in each scanline.
			subByte = buf[i - this.byteStreamMode];
		}
		return (curByte - subByte) % 256;//Unsigned bytes only hold 0 - 255 so if there is overflow or underflow it is the modulo of the result.
	}else if(fMode == 2){//Up, subtract byte above.
		var upByte = 0;//If on the edge with no pixels above it is treated as 0.
		if(y > minY){//Exactly minY is the first scanline.
			upByte = buf[i - scanWidth];
		}
		return (curByte - upByte) % 256;
	}else if(fMode == 3){//Average, using above and to the left.
		var aveSub = 0, aveUp = 0;
		if(x > minX){
			aveSub = buf[i - this.byteStreamMode];
		}
		if(y > minY){
			aveUp = buf[i - scanWidth];
		}
		return (curByte - Math.floor( (aveSub + aveUp) / 2)) % 256;
	}else if(fMode == 4){//Paeth, check left, above, and above-left
		var bA = 0, bB = 0, bC = 0;//in order of: left, above, above-left
		if(x > minX){
			bA = buf[i - this.byteStreamMode];
			if(y > minY){
				bC = buf[i - this.byteStreamMode - scanWidth];
			}
		}
		if(y > minY){
			bB = buf[i - scanWidth];
		}
		var pABC = bA + bB - bC;
		var pA = Math.abs(pABC - bA);//calculate closeness of bytes A, B, C.
		var pB = Math.abs(pABC - bB);
		var pC = Math.abs(pABC - bC);
		var paethByte;
		if(pA <= pB && pA <= pC){
			paethByte = bA;
		}else if(pB <= pC){
			paethByte = bB;
		}else{
			paethByte = bC;
		}
		return (curByte - paethByte) % 256;
	}else if(fMode == 0){//No filtering.
		return curByte;
	}
};
GraFlicEncoder.prototype.initBuffersPNG = function(){
				var byteBufLength = this.outputWidth * this.outputHeight * this.byteStreamMode;
				this.bufNO = new Uint8Array(new ArrayBuffer(byteBufLength));//None-Over...
				this.bufPO = new Uint8Array(new ArrayBuffer(byteBufLength));
				this.bufTO = new Uint8Array(new ArrayBuffer(byteBufLength));
				this.bufNS = new Uint8Array(new ArrayBuffer(byteBufLength));
				this.bufPS = new Uint8Array(new ArrayBuffer(byteBufLength));
				this.bufTS = new Uint8Array(new ArrayBuffer(byteBufLength));//...Tran-Source
				//These buffers will track how the output buffer would be updated based on different disposal/blend modes
				//They do not need the extra bytes for the filter mode. That will be added after the optimal buffer is selected.
				//These only contain the updated regions as the would be drawn, the positions outside of the current region can be ignored.
				
				//------------------------------------------------------------
	//These buffers will be filled with the actual results of disposal methods and used to see how to draw.
				this.bufNone = new Uint8Array(new ArrayBuffer(byteBufLength));
				this.bufPrev = new Uint8Array(new ArrayBuffer(byteBufLength));
				this.bufTran = new Uint8Array(new ArrayBuffer(byteBufLength));
				
				//SOME BROWSERS DO NOT INITIALIZE Uint8Array TO ZERO! MAKE SURE THIS IS DONE!
				//NOTE: 0 should be the index value for fully transparent in most cases since it is inserted into the candidate array with maxed out count if multi-frame.
				if(this.byteStreamMode == 1){//8-bit
					var filler = this.paletteTransI ? this.paletteTransI : 0;
					this.bufNO.fill(filler);this.bufPO.fill(filler);
					this.bufTO.fill(filler);this.bufNS.fill(filler);
					this.bufPS.fill(filler);this.bufTS.fill(filler);
					this.bufNone.fill(filler);this.bufPrev.fill(filler);this.bufTran.fill(filler);
				}else if(this.byteStreamMode == 4){//32-bit
					this.bufNO.fill(0);this.bufPO.fill(0);this.bufTO.fill(0);this.bufNS.fill(0);this.bufPS.fill(0);this.bufTS.fill(0);
					this.bufNone.fill(0);this.bufPrev.fill(0);this.bufTran.fill(0);
				}else{//24-bit
					//24-bit and 8-bit with no tRNS cannot initialize buffer data to transparent black.
					//However, since the first frame always is forced to use Source blending and the Tran buffer, this is not a problem.
					//tRNS will always be added for pixel recycling if multi-frame.
					//24-bit initialization is a bit more complicated, it must initialize pixels to the R,G,B values of the reserved transparent color.
					if(this.reservedTransColor[0] > -1){
						for(var i = 0;i < byteBufLength;i += 3){
							for(var chanI = 0;chanI < 3;chanI++){
								this.bufNO[i + chanI] = this.reservedTransColor[chanI];
								this.bufPO[i + chanI] = this.reservedTransColor[chanI];
								this.bufTO[i + chanI] = this.reservedTransColor[chanI];
								this.bufNS[i + chanI] = this.reservedTransColor[chanI];
								this.bufPS[i + chanI] = this.reservedTransColor[chanI];
								this.bufTS[i + chanI] = this.reservedTransColor[chanI];
								this.bufNone[i + chanI] = this.reservedTransColor[chanI];
								this.bufPrev[i + chanI] = this.reservedTransColor[chanI];
								this.bufTran[i + chanI] = this.reservedTransColor[chanI];
							}
						}
					}
				}
};

/*
GraFlicImport loads an animated image like Animated PNG and breaks it down into drawable frames so that the image can be used by web apps that need to freeze frame at specific frames. Developers can use Animated PNGs as components in a web-app that will create an animation making use of these animations.

Example:
var aDec = new GraFlicImport('/path/to_animated.png');
canvasContext.drawImage(aDec.getFrame(1000), 0, 0);

*/
function GraFlicImport(decSource, paramz){
	//decSource can be a URL to an image, or a Blob,  for example from file input. ('File' objects are Blob with .name containing filename)
	this.ready = false;//Set to true when animated image dissected and ready for frame by frame play/pause etc.
	this.frames = [];
	this.buildCanv = document.createElement('canvas');//used to build step by step via region/blend/dispose params.
	if(paramz !== undefined){
		//sending object of parameters instead of string to create a copy that has a filter or change applied.
		//it will be constructed with different logic by copying an existing GraFlicImport
		return;
	}
	this.prevCanv = document.createElement('canvas');
		//(define buildCanv here so GraFlicImport.getFrame() can be drawn as soon as initialized and will not have an error before loaded)
	this.loadFunc = GraFlicImport_sourceLoaded.bind(this);//Make sure 'this' references the class object.
	if(decSource instanceof Blob){
		//File is a Blob with '.name' set. If file is sent it does not need to wait for an XHR.
		this.imgReq = new FileReader();
		this.imgReq.addEventListener('load', this.loadFunc);
		this.imgReq.readAsArrayBuffer(decSource);
	}else{
		this.imgReq = new XMLHttpRequest();
		this.imgReq.open('GET', decSource, true);
		this.imgReq.responseType = 'arraybuffer';
		this.imgReq.addEventListener('load', this.loadFunc);
		this.imgReq.send();
	}
}//end constructor
function GraFlicImport_sourceLoaded(adEvent){
	this.imgReq.removeEventListener('load', this.loadFunc);
	var headLen;//length of chunks that should be at the head of the file for each extracted and reconstructed image.
	var copyChunks = [];//start, end location pairs of chunks that should be copied on to the shared head for reconstructed frames.
	this.copyFrames = [];//Array of objects
		//.start stores start locations for frames(will end at next non-IDAT/fdAT)
		//.len stores final lengths that the file/array buffer will be for each frame image.
	this.copyFrame = 0;//Frame being copied into single image.
	this.ms = 0;//duration in milliseconds for the whole animation.
	var oct, chunkSig, chunkLen, cFrame;
	if(this.imgReq.response){//XHR will have .response
		oct = new Uint8Array(this.imgReq.response);
	}else{//FileReader will have .result
		oct = new Uint8Array(this.imgReq.result);
	}
	var pos = 0;//seek position in source file
	this.inputOctetStream = oct;
	this.animated = false;//Set to true when animation detected.
	this.frameCount = 0;//(includes default image, if present)
	if( oct[0] == 0x89 //PNG Magic number
	 && oct[1] == 0x50
	 && oct[2] == 0x4E
	 && oct[3] == 0x47 ){
		this.format = 'png';
		this.png = {};
		copyChunks.push(0, 33);
		headLen = 33;
		var metaChunks = ['tRNS', 'PLTE', 'sRGB', 'gAMA', 'bKGD', 'sBIT', 'hIST', 'cHRM'];//Meta chunks that need to (our ought to) be preserved if present so image data can be drawn correctly.
		//var acTLSeen = false;//To be APNG acTL must be before IDAT.
		//All image types have width/height.
		this.width = GraFlicEncoder.readUint32(oct, 16, false);
		this.height = GraFlicEncoder.readUint32(oct, 20, false);
		this.png.bitDepth = oct[24];
		this.png.colorFlags = oct[25];
		this.png.interlace = oct[28];
		pos = 33;
		//this.png.hasDefaultImage = false;//set to true if no fcTL before IDAT
		chunkSig = GraFlicEncoder.readFourCC(oct, pos + 4);
		var animFrame = -1;//set to 0 when past the default image if present and the first fcTL is encountered. Increment each fcTL
		//The animation has not started until an fcTL has been seen.
		//The IDAT is not part of the animation and is the default image if fcTL is not before it.
		//So the actual animation frames start at the first fcTL.
		//Get the frame count by counting each frame entry seen that is part of the animation rather than going by the count in acTL.
		//Some browsers may ignore the frame count value and just look at this, meaning some images may be out there with an inaccurate value in frameCount.
		while(chunkSig != 'IEND'){//!fcTLSeen || (chunkSig != 'IDAT' && chunkSig != 'fdAT')){
			chunkLen = GraFlicEncoder.readUint32(oct, pos, false);
			if(chunkSig == 'acTL'){
				//acTL is not in metaChunks it is not used to reconstruct as extracted still frames.
				//this.frameCount = GraFlicEncoder.readUint32(oct, pos + 8, false);//Get this by counting actual frames seen instead.
				this.loops = GraFlicEncoder.readUint32(oct, pos + 12, false);
			}
			if(chunkSig == 'IEND'){
				break;
			}
			if(chunkSig == 'IDAT'){
				if(animFrame == -1){
					//(If not animated PNG, defaultImage will be the only frame.)
					this.png.hasDefaultImage = true;//IDAT not part of the animation
					cFrame = {};
					this.copyFrames.push(cFrame);
					cFrame.start = pos;//Start reading at start of IDAT in new GraFlicImportFrame().
					cFrame.len = 24 + chunkLen + headLen;//current IDAT + shared head + IEND
					cFrame.width = this.width;//Default image but fill the whole image dimensions.
					cFrame.height = this.height;
					cFrame.x = 0;
					cFrame.y = 0;
					//cFrame.ms = 0;// N/A for default image.
					//cFrame.dispose = oct[pos + 32];// N/A
					//cFrame.blend = oct[pos + 33];// N/A
					//this.png.defaultImage = cFrame;//will be undefined if no Default Image
					animFrame++;
					this.frameCount++;
				}else{
					this.copyFrames[animFrame].len += chunkLen + 12;//Secondary IDAT, increment copy region
				}
			}
			if(chunkSig == 'fdAT'){
				this.copyFrames[animFrame].len += chunkLen + 8;//+8, not +12 because frameSequenceCount must be stripped out.
			}
			if(metaChunks.indexOf(chunkSig) !== -1){
				copyChunks.push(pos, pos + chunkLen + 12);
				headLen += chunkLen + 12;
			}
			if(chunkSig == 'fcTL'){
				this.animated = true;
				animFrame++;
				this.frameCount++;//Remember, frames can have multiple fdAT/IDAT, so count by fcTL.
				cFrame = {};
				this.copyFrames.push(cFrame);
				cFrame.start = pos + chunkLen + 12;//Start reading after the fcTL in new GraFlicImportFrame().
				cFrame.len = 12 + headLen;//shared head + IEND
				cFrame.width = GraFlicEncoder.readUint32(oct, pos + 12, false);
				cFrame.height = GraFlicEncoder.readUint32(oct, pos + 16, false);
				cFrame.x = GraFlicEncoder.readUint32(oct, pos + 20, false);
				cFrame.y = GraFlicEncoder.readUint32(oct, pos + 24, false);
				cFrame.ms = ( GraFlicEncoder.readUint16(oct, pos + 28, false) / GraFlicEncoder.readUint16(oct, pos + 30, false) ) * 1000;//milliseconds
				cFrame.disposal = oct[pos + 32];
				cFrame.blending = oct[pos + 33];
				this.ms += cFrame.ms;
			}
			
			pos += chunkLen + 12;
			chunkSig = GraFlicEncoder.readFourCC(oct, pos + 4);
		}
		/*if(animFrame == -1){
			//if(this.onError){
			//	this.onError(this);
			//}
			//alert('no fcTL, not APNG');
			return;
		}*/
		this.sharedHead = new Uint8Array(new ArrayBuffer(headLen));
		var copyI = 0;//Copy chunks that are part of the head of the file into the shared head.
		for(var ccI = 0;ccI < copyChunks.length;ccI += 2){
			var ccEnd = copyChunks[ccI + 1];
			for(var i = copyChunks[ccI];i < ccEnd;i++){
				this.sharedHead[copyI] = oct[i];
				copyI++;
			}
		}
	}else if( //end if PNG
	    oct[0] == 0x47 //GIF Magic number
	 && oct[1] == 0x49
	 && oct[2] == 0x46 ){//not checking 89a, hopefully 87 has no problems
		//Allow building from GIF so that GIFs can be converted to APNGs
		this.format = 'gif';
		this.gif = {};
		//read logical screen descriptor
		this.width = GraFlicEncoder.readUint16(oct, 6, true);
		this.height = GraFlicEncoder.readUint16(oct, 8, true);
		//alert('GIF h/w ' + this.width + ' x ' + this.height);
		//[10] is a packed field
		//alert('logdesc packed field ' + oct[10].toString(16));
		//ignore color resolution and sort flag, just get global color table flag and size of table if it is there
		//packed field: global_color_table(1) / color_res(3) / sort(1) / size_of_global_color_table(3)
		this.gif.globalColorTable = (oct[10] & 0x80) > 0;
		//alert(oct[10] & 0x80);
		//alert('hasGCT? ' + this.gif.globalColorTable);
		var globalColorTableSize = 3 * Math.pow(2, (oct[10] & 0x07) + 1);
		//GIF has an odd way of storing size that only moves in increments of raising the power.
		//alert('glob t size '+ this.gif.globalColorTableSize);
		//[11] is transparent pixel index
		//[12] is aspect ratio
		pos += 13;
		if(this.gif.globalColorTable){
			this.gif.globalColorTable = [];
			for(i = 0;i < globalColorTableSize;i++){
				this.gif.globalColorTable.push(oct[pos]);
				pos++;
			}
		}
		var chunkLabel;
		cFrame = {};//Initialize this here. If it is a still GIF with no GCE, this will be ready to insert after image data.
		cFrame.gif = {};
		cFrame.len = 0;
		chunkSig = oct[pos];
		pos++;
		while(chunkSig != 0x3B){//end of image marker
			//alert('GIF chunk: ' + chunkSig.toString(16));
			//GIF chunks have a series of blocks with 1 byte lengths
			if(chunkSig == 0x2C){//image descriptor
				cFrame.x = GraFlicEncoder.readUint16(oct, pos, true);
				cFrame.y = GraFlicEncoder.readUint16(oct, pos + 2, true);
				cFrame.width = GraFlicEncoder.readUint16(oct, pos + 4, true);
				cFrame.height = GraFlicEncoder.readUint16(oct, pos + 6, true);
				//+8 is packed field: global_color_table(1) / interlace(1) / sort(1) / reserved(2) / size_of_local_color_table(3)
				pos += 8;
				cFrame.gif.localColorTable = (oct[pos] & 0x80) > 0;
				cFrame.gif.interlaced = (oct[pos] & 0x40) > 0;
				cFrame.gif.sort = (oct[pos] & 0x20) > 0;
				var localColorTableSize = 3 * Math.pow(2, (oct[pos] & 0x07) + 1);
				pos++;
				//alert('has ' + cFrame.gif.localColorTable + ' s: ' + localColorTableSize + ' i: ' + cFrame.gif.interlaced + ' srt: ' + cFrame.gif.sort);
				
				if(cFrame.gif.localColorTable){
					cFrame.gif.localColorTable = [];
					for(i = 0;i < localColorTableSize;i++){
						cFrame.gif.localColorTable.push(oct[pos]);
						pos++;
					}
				}
				
				cFrame.gif.minCodeWidth = oct[pos];
				cFrame.start = pos;//start copying at LZW minimum code size
				pos++;

				cFrame.len += 793;//the frame blob will always have a global color table built off of global, or local if present
				//head(13) + max-size color table(768) + ImgMarker(1) + ImgDesc(9) + minCodeSize(1) + end marker(1)
				//(N-App block not needed, just temporary image to be canvas-readable)
				
				chunkLen = oct[pos];
				pos++;
				cFrame.len += chunkLen + 1;
				while(chunkLen != 0){//0 length block is a terminator
					pos += chunkLen;
					chunkLen = oct[pos];
					pos++;
					cFrame.len += chunkLen + 1;
				}
				this.copyFrames.push(cFrame);//Do this here, remember GIFs can be static with no GCE
				this.frameCount++;
				if(this.frameCount > 1){this.animated = true;}
			}else if(chunkSig == 0x21){//extension introducer
				chunkLabel = oct[pos];//label of block
				pos++;
				//alert('GIF chunk label: ' + chunkLabel.toString(16));
				if(chunkLabel == 0xF9){//graphic controls extension
					cFrame = {};//If GCE present, init with delay/transparency info
					cFrame.gif = {};
					cFrame.len = 0;
					cFrame.disposal = Math.max(0, (oct[pos + 1] >> 2 & 0x07) - 1);
						//offset by -1 because GIF mode 0 is no required disposal and mode 1 is do not dispose.
						//2 is dispose to background, 3 is dispose to previous, 4-7 undefined
						//this makes it consistent with the Animated PNG codes
					cFrame.blending = 1;//use over blending, GIF does not have blending modes, only disposal logic
					//alert('disposal ' + cFrame.disposal);
					cFrame.ms = GraFlicEncoder.readUint16(oct, pos + 2, true) * 10;//100ths of a second
					//if(cFrame.ms < 100){cFrame.ms = 100;}//GIF images get capped at 10 FPS by most browsers/viewers, this keeps them consistent with how they are seen??
					//alert('delay extracted ' + cFrame.ms);
					this.ms += cFrame.ms;
					//alert(oct[pos + 1] + ' & ' + (oct[pos + 1] & 0x01));
					if(oct[pos + 1] & 0x01){//if override transparent index flag is set
						cFrame.gif.transparentIndex = oct[pos + 4];
						cFrame.len += 8;//must include the GCE in the rebuild stream from the payload to set the transparent pixel
					}
					pos += 6;//4 bytes of data plus length(1) and zero length terminator(1)
				}else{//other/unknown extension
					chunkLen = oct[pos];
					pos++;
					while(chunkLen != 0){//0 length block is a terminator
						pos += chunkLen;
						chunkLen = oct[pos];
						pos++;
					}
				}
			}
			chunkSig = oct[pos];
			pos++;
		}
		//head(13)
		this.sharedHead = new Uint8Array([0x47,0x49,0x46,0x38,0x39,0x61,0,0,0,0,0xF7,0,0]);
		//alert('ended at ' + chunkSig.toString(16));
	}//end if GIF
	delete this.imgReq;
	delete this.loadFunc;
	if(this.onHeadDecoded){
		this.onHeadDecoded(this);
	}
	this.buildCanv.width = this.width;
	this.buildCanv.height = this.height;
	this.prevCanv.width = this.width;
	this.prevCanv.height = this.height;
		var this_this = this;
	setTimeout(function(){
		new GraFlicImportFrame(this_this);
	}, 50);
	
}//end _sourceloaded()
GraFlicImport.prototype.getFrame = function(ms){
	//Get drawable based on Milliseconds duration. If past the end modulo it.
	//Always get by MS. Getting by index is a bad idea. A good endcoder might remove frames that can be removed and increase the duration of previous frame if there are no changes between frames for an animation based on FPS captures of a source animation, for example.
	//An assumption of having frame data spaced out at even intervals is flawed.
	if(!this.frames.length){
		//If unfinished return canvas or animation at latest progress so far.
		return this.buildCanv;
	}
	if(this.frames.length < this.frameCount){
		//do not return buildCanv, use latest available frame (build canv may have been wiped by disposal)
		//try to go 2 frames back and draw a canvas that has been for sure drawn on and not just initialized.
		return this.frames[Math.max(0, this.frames.length - 2)].canvas;
	}
	ms = ms % this.ms;
	var aeFrame = this.frames[0];//return default image(0) if plain PNG with no other frames.
	var aeProg = 0;
	var i;
	if(this.png && this.png.hasDefaultImage){
		i = 1;//Start animation after default image.
	}else{
		i = 0;
	}
	for(;i < this.frames.length;i++){
		aeFrame = this.frames[i];
		aeProg += aeFrame.ms;
		if(aeProg > ms){break;}//>, not >=
		//If 16 FPS, sending 0 as ms, it would return [0]
		//if sending 16, it would return [0] again if >= because the 16 delay is = 16
	}
	return aeFrame.canvas;
};
/*
Although, storing them as full frames ready to draw may be better in cases with instances of the same graphic that are at different animation offsets at different times.
If converting GIF to Animated PNG, it will take the fully drawn version of frames and do the pixel-recycling logic in the encoder.
*/
function GraFlicImportFrame(aeImg){
	if(!this.copyFrame){delete aeImg.loadFunc;}
	this.aeImg = aeImg;
	var key;
	for(key in aeImg.copyFrames[aeImg.copyFrame]){
		this[key] = aeImg.copyFrames[aeImg.copyFrame][key];
	}
	for(key in aeImg.copyFrames[aeImg.copyFrame]){
		delete aeImg.copyFrames[aeImg.copyFrame][key];
	}
	var oct = new Uint8Array(new ArrayBuffer(this.len));
	var pos, i,
	    rPos;//read position
	for(pos = 0;pos < aeImg.sharedHead.length;pos++){
		oct[pos] = aeImg.sharedHead[pos];
	}
	var chunkSig, chunkLen, chunkStop;
	if(aeImg.png){
		//calculate size (space taken up within the APNG) for analysis purposes. (size the frame takes up in the image is different than size once built into a standalone image)
		this.sizeInAnimation = oct.length - 12 - aeImg.sharedHead.length + 26;//Does not have sharedHead or IEND, but does have fcTL(26)
	
		rPos = this.start;
		var crc32, crcStart;
		GraFlicEncoder.writeUint32(oct, this.width, 16, false);//local region for frame
		GraFlicEncoder.writeUint32(oct, this.height, 20, false);
		//rememeber to recalc CRC when width and height changed in head IHDR(remember IHDR MUST be first.)
		crc32 = GraFlicEncoder.getCRC32(oct, 12, 29);
		GraFlicEncoder.writeUint32(oct, crc32, 29, false);
		
		chunkSig = GraFlicEncoder.readFourCC(aeImg.inputOctetStream, rPos + 4);
		while(chunkSig == 'IDAT' || chunkSig == 'fdAT'){
			chunkLen = GraFlicEncoder.readUint32(aeImg.inputOctetStream, rPos, false);
			GraFlicEncoder.writeUint32(oct, chunkSig == 'fdAT'?chunkLen - 4:chunkLen, pos, false);
			GraFlicEncoder.writeFourCC(oct, 'IDAT', pos + 4, false);//Always IDAT never fdAT for non-animated single frame.
			pos += 8;
			rPos += 8;
			crcStart = pos - 4;//the start where it is being WRITTEN into(-4 to CRC over FourCC)
			chunkStop = rPos + chunkLen;//Stops after payload before CRC.
			if(chunkSig == 'fdAT'){rPos += 4;}//skip frameSequenceCount
			for(;rPos < chunkStop;rPos++){
				oct[pos] = aeImg.inputOctetStream[rPos];
				pos++;
			}
			//Recalculate CRC. It will be different without frameSequenceCount;
			crc32 = GraFlicEncoder.getCRC32(oct, crcStart, pos);
			GraFlicEncoder.writeUint32(oct, crc32, pos, false);
			pos += 4;
			rPos += 4;//skip CRC
			chunkSig = GraFlicEncoder.readFourCC(aeImg.inputOctetStream, rPos + 4);
		}
		
		GraFlicEncoder.writeUint32(oct, 0, pos, false);//IEND is empty
		GraFlicEncoder.writeFourCC(oct, 'IEND', pos + 4);
		crc32 = GraFlicEncoder.getCRC32(oct, pos + 4, pos + 8);
		GraFlicEncoder.writeUint32(oct, crc32, pos + 8, false);
		this.payloadBlob = new Blob([oct], {'type':'image/png'});
		this.payloadBlobURL = URL.createObjectURL(this.payloadBlob);
	}else if(aeImg.gif){//end is PNG
		//alert('a');
		GraFlicEncoder.writeUint16(oct, this.width, 6, true);//local region
		GraFlicEncoder.writeUint16(oct, this.height, 8, true);
		pos = 13;
		var colorTable = this.gif.localColorTable? this.gif.localColorTable : aeImg.gif.globalColorTable;//use local color table if present
		for(i = 0;i < colorTable.length;i++){
			oct[pos + i] = colorTable[i];
		}
		//there will always be 256 color slots, indices not used will be ignored. no need to optimize temporary blob used intermediately to render on canvas
		pos += 768;
		if(this.gif.transparentIndex !== undefined){
			oct[pos + 0] = 0x21;
			oct[pos + 1] = 0xF9;
			oct[pos + 2] = 0x04;
			oct[pos + 3] = 0x05;// 0000101 reserved(000), no disposal(001), no user-input(0), transparent index flag on(1)
			oct[pos + 4] = 0xFF;//delay
			oct[pos + 5] = 0xFF;
			oct[pos + 6] = this.gif.transparentIndex;//transparent index
			oct[pos + 7] = 0x00;
			
			pos += 8;
		}
		oct[pos] = 0x2C;//Image Descriptor
		pos++;
		
		GraFlicEncoder.writeUint16(oct, 0, pos + 0, true);
		GraFlicEncoder.writeUint16(oct, 0, pos + 2, true);
		GraFlicEncoder.writeUint16(oct, this.width, pos + 4, true);
		GraFlicEncoder.writeUint16(oct, this.height, pos + 6, true);
		var packedField = 0;
		if(this.gif.interlaced){packedField &= 0x40;}
		oct[pos + 8] = packedField;
		
		pos += 9;
		//alert('b');
		
		for(i = 0;i < this.len;i++){
			oct[pos + i] = aeImg.inputOctetStream[this.start + i];
		}
		pos += i;
		
		//alert('c');
		oct[pos] = 0x3B;//end of image
		this.payloadBlob = new Blob([oct], {'type':'image/gif'});
		this.payloadBlobURL = URL.createObjectURL(this.payloadBlob);
		//alert('pblob ' + this.payloadBlobURL + ' size ' + this.payloadBlob.size + ' ' + String.fromCharCode.apply(null,oct));
	}
	aeImg.frames.push(this);
	
	this.payloadImage = new Image();
	this.loadFunc = GraFlicImportFrame_loaded.bind(this);
	this.payloadImage.addEventListener('load', this.loadFunc);
	this.payloadImage.src = this.payloadBlobURL;
	
	//(Initialize this here so that there are not potential errors when this is returned by .getFrame as undefined.)
	//The image as it is read from the file. It can be recolored or filtered later for advanced effects.
	this.canvas = document.createElement('canvas');
	this.canvas.width = aeImg.width;
	this.canvas.height = aeImg.height;
	//TODO: add filteredCanvas for when recolor or other effects dynamically added to the original.
	//TODO: make a .destroy or .delete function that derefs resources and revokes object URLs.
}//end constructor
function GraFlicImportFrame_loaded(){
	this.payloadImage.removeEventListener('load', this.loadFunc);
	var aeImg = this.aeImg;
	
	//Note: GIF disposal codes are not the same, they must be converted to match PNG disposal codes.
	
	var cx;
	if(aeImg.png && aeImg.png.hasDefaultImage && !aeImg.copyFrame){
		//Default image is not drawn onto the animation buffer.
		cx = this.canvas.getContext('2d');
		cx.drawImage(this.payloadImage, 0, 0);
	}else{
		cx = aeImg.prevCanv.getContext('2d');
		cx.clearRect(0, 0, aeImg.width, aeImg.height);
		cx.drawImage(aeImg.buildCanv, 0, 0);//save previous state before drawing
			//(Previous disposes to previous state of the buffer, NOT previous frame as it was drawn)
		cx = aeImg.buildCanv.getContext('2d');
		if(!this.blending){//Over blending does not overwrite the area, just draws on top of it.
			cx.clearRect(this.x, this.y, this.width, this.height);
		}
		cx.drawImage(this.payloadImage, this.x, this.y);
		
		//draw the buffer state for this frame onto baseCanvas
		cx = this.canvas.getContext('2d');
		cx.drawImage(aeImg.buildCanv, 0, 0);

		//now do disposal after it is drawn.
		cx = aeImg.buildCanv.getContext('2d');
		var firstFrameI = 0;
		if(aeImg.png && aeImg.png.hasDefaultImage){
			firstFrameI = 1;
		}
		//if(aeImg.copyFrame > firstFrameI){//Disposal (cannot dispose with no previous frame)
			//var dispFrame = aeImg.frames[aeImg.copyFrame - 1];
			//for type 0 no disposal, just draw on the buffer as it is.
		if(this.disposal == 1){//clear region to background
			cx.clearRect(this.x, this.y, this.width, this.height);
		}else if(this.disposal == 2){
			//var prevFrame = aeImg.frames[aeImg.copyFrame - 1];
			cx.clearRect(0, 0, aeImg.width, aeImg.height);
			//Some GIFs seem to have disposal set to previous on the first frame which does not make sense,
			//but just clear it because there is no previous.
			if(aeImg.copyFrame > firstFrameI){
				cx.drawImage(aeImg.prevCanv, 0, 0);
						//dispFrame.x, dispFrame.y, dispFrame.width, dispFrame.height,//Source/Dest coords are the same.
						//dispFrame.x, dispFrame.y, dispFrame.width, dispFrame.height);
			}
		}
		//}
	}//end not default image
	
	aeImg.copyFrame++;
	if(aeImg.onFrameDecoded){
		aeImg.onFrameDecoded(this);
	}
	if(aeImg.copyFrame < aeImg.frameCount){
		setTimeout(function(){
			new GraFlicImportFrame(aeImg);
		}, 50);
	}else{
		//otherwise all loading finished
		aeImg.ready = true;
		if(aeImg.onDecoded){
			aeImg.onDecoded(aeImg);
		}
	}
	delete this.loadFunc;
}//end _finished

/*
.cloneWithOptions allows for filters to be applied to a copy of the original.
Other options may be added later, for now it focuses on just filtering.
This copy is meant for playback only and will not have all of the metadata or details from the original decoder.
Send an object as a parameter that has .filter set to the function that accepts the pixel object parameter.
Here is an example that converts colors to grayscale:

var fOptions = {};
fOptions.filter = function(pixel){
	var gray = (pixel.r + pixel.g + pixel.b)/3;
	pixel.r = gray;
	pixel.g = gray;
	pixel.b = gray;
};
var grayscaleClone = anGraFlicImport.cloneWithOptions(fOptions);

*/
GraFlicImport.prototype.cloneWithOptions = function(options){
	//This is used to create a clone of the animation that has a filter or transformation applied to the canvas bitmap.
	//(The approach of appling a filter to the drawn results of the current position
	//could be taken, but is very resource intensive.)
	//options is an object with parameters like filter function
	var cParamz = {"clone":true};
	var cloneDec = new GraFlicImport(null, cParamz);
	options.original = this;
	cloneDec.options = options;
	cloneDec.cloneLoadFunc = GraFlicImport_cloneFrame.bind(cloneDec);
	setTimeout(cloneDec.cloneLoadFunc, 50);
	if(this.png && this.png.hasDefaultImage){
		//needed to skip default frame in animation.
		cloneDec.png = {"hasDefaultImage":true};
	}
	return cloneDec;
};
function GraFlicImport_cloneFrame(){
	if(!this.options.original.ready &&
	(!this.options.original.frameCount || this.options.original.frames.length < this.frames.length + 2)){
		//If not fully finished, hold it back 2 frames because the latest one might not be finished yet.
		//Will have to delay. Cannot finish cloing until the original is done...
		setTimeout(this.cloneLoadFunc, 500);
		return;
	}
	//Might not have the frameCount/ms yet if original source image had not loaded when cloned.
	this.frameCount = this.options.original.frameCount;
	this.ms = this.options.original.ms;
	var sFrame = this.options.original.frames[this.frames.length];
	var cFrame = {};
	this.frames.push(cFrame);
	cFrame.ms = sFrame.ms;
	var cv = document.createElement('canvas');
	cFrame.canvas = cv;
	cv.width = sFrame.canvas.width;
	cv.height = sFrame.canvas.height;
	var cx = cv.getContext('2d');
	cx.drawImage(sFrame.canvas, 0, 0);
	if(this.options.filter){
		var pix = {};//pixel object, will be updated for each pixel
		pix.w = cv.width;//some filters may reference canvas size/position
		pix.h = cv.height;
		pix.x = 0;
		pix.y = 0;
		var dat = cx.getImageData(0, 0, cv.width, cv.height);
		var pixLen = cv.width * cv.height * 4;
		for(var i=0;i<pixLen;i+=4){
			pix.r = dat.data[i];
			pix.g = dat.data[i + 1];
			pix.b = dat.data[i + 2];
			pix.a = dat.data[i + 3];
			this.options.filter(pix);
			//after the filter has operated on the RGB, set the new values
			dat.data[i]     = pix.r;
			dat.data[i + 1] = pix.g;
			dat.data[i + 2] = pix.b;
			dat.data[i + 3] = pix.a;
			pix.x++;
			if(pix.x == cv.width){
				pix.x = 0;
				pix.y++;
			}
		}
		cx.putImageData(dat, 0, 0);
	}
	if(this.frames.length < this.frameCount){
		setTimeout(this.cloneLoadFunc, 50);
	}else{
		delete this.cloneLoadFunc;
		if(this.options.filter){delete this.options.filter;}//filtering done. clear this in case it was a dynamically made function that hogs resources.
		this.ready = true;
	}
}

