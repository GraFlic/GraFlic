/*
AnimatedEncoder by Compukaze LLC
Check AnimatedWEBPs.com and AnimatedPNGs.com for info on the formats this works with.

Inspired by the Animated PNG/GIF encoder of my Deckromancy.com and Punykura.com projects,
but built in Javascript rather than ActionScript 3 and leverages the native
(and in some cases hardware-accelerated) image encoders of the browser
via Canvas.toDataURL()

=============================================================================

The MIT License (MIT)

Copyright (c) 2016 Compukaze LLC

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

Note that this version is very early and allot of things will be missing
or incomplete this early on.

Version 0.0.1 Alpha
Animated WEBP Export is pretty much working
Other things are still pretty much under construction.
Other formats will not work yet.
Format support is based on what formats a given browser supports as
an export type from <canvas>

Takes a list of img/canvas/image URLs
and makes an Animated WEBP or Animated PNG or Animated GIF or Animated WEBM

To support an animated format the browser must support it as canvas export
here is what browsers would currently (early 2016) be capable of supporting
            (once implementation is finished, of course)
as output (note that Edge and Chrome CANNOT natively PLAY Animated PNG,
but they WILL the first frame or APNG default image):

Browser | Could generate (not necessarily view animation)
--------+-------------------------------------------------------
Chrome  | Animated PNG, Animated WEBP
Firefox | Animated PNG
Safari  | Animated PNG, Animated GIF
Edge    | Animated PNG


USAGE:

var paramz = {
	"format":'<png|gif|webp|webm>',
	"configs":<array of advanced configurations to set delays, etc.>
	"quality":<0-1> 0% - 100% quality. Lower quality saves more space.
	"delay":<positive integer, 1 or greater>, delay in milliseconds
			(may get limited to 600 on GIF due to browser implementations)
	"width":<uint for pixel dimensions>,
	"height":<uint for pixel dimensions>,
	"onEncoded":<function to call when done>
}

var ae = new AnimatedEncoder(paramz);

f = {
	"file":<[Object File]>
	<more optional parameters will be added later>
};
ae.addFrame(f);
	(repeat this several times)
ae.saveAnimatedFile();

function onEncodedFunc(ae){
	//finally set the image src to the base 64 encoded animated image.
	anImage.src = ae.outputBase64;
}


	**********The following will be set internally and do*******
	***************NOT need to be set in paramz*****************
	"frames":<frame setups>
	"payloads":<will store the bitstreams of extracted frames to build from>
	"sourceFormat":<png|gif|webp> (The format that the encodings will be extracted from based on the browser's supported Canvas.toDataURL() encodings. Internally set based on format, webm and webp will both use webp as the source since there is no webm toToDataURL and they share the same VPX bitstreams.)
	************************************************************


[Featuroach] NOTE THAT IMAGE CREATION WILL FAIL IF
the image is NOT either
(A) Selected by the user from their device/photo gallery
(B) Locally located on the same server AND website domain name
This is because of a Javascript 'security' Featuroach ('Feature'/Bug that hides and creeps around in your code like a filthy roach)
This featuroach considers accessing the contents of those images a security risk and may scream about 'security' or a 'tainted' canvas in browser console.

*/
function AnimatedEncoder(paramz,simpleQuality){
	if(paramz == 'webp'//only webp is implemented so far
	 ||paramz == 'png'
	 ||paramz == 'gif'
	 ||paramz == 'webm'){
		//type checking in Javascript is weird, so this will be more reliable
		//if called with an unsupported string it could break,
		//but that is not a valid value to call it with
		//Valid initialization values are:
//new AnimatedEncoder('webp'|'webm'|'png'|'gif'|Object)
		paramz = {
				"format":paramz
			};
		if(simpleQuality!==undefined){
			paramz.quality = simpleQuality;
		}
	}
	//set up defaults
	this.format = 'png';//Canvas.toDataURL('image/png'); supported in all browsers, so this is default.
	this.comment = 'Saved with AnimatedEncoder ( AnimatedWEBPs.com )';
	this.quality = '0.75';
	this.width = 1;
	this.height = 1;
	this.autoDim= !(paramz.width&&paramz.height);//automatic dimensions
		//automatically turn this on if no width/height set.
		//it can be overridden with a paramz variable.
		//(though that may be a bad idea because defaults to 1x1,
		//allowing expansion when autoDim is true.)
	this.delay = 75;//the delay for all frames, unless frame-specific delay set.
	this.onEncoded = null;
	this.fitting = 'plain';
	/*fitting
		'plain' = Draw image at actual size on the canvas at (0,0).
			The image may be cropped,
			or it may not fill the full area.
		'stretch' = Stretch the image to fill dimensions.
			it may be skewed.
		'snap' = Make the image fill the canvas, but maintain aspect ratio
			without being skewed.
			The top and bottom may be cropped,
			or the left and right may be cropped.
			it will be centered either way.
	*/
	
	//following values should not be overridden:
	this.output64 = null;
	this.outputOctetStream = null;
	this.frames = [];
	this.chunkPackI = 0;
	
	for(var key in paramz){
		this[key] = paramz[key];
		//alert('this['+key+'] = '+paramz[key]);
	}
	this.sourceFormat = this.format;//in most cases these are the same.
	if(this.format == 'webm'){
		this.sourceFormat = 'webp';
	}
	this.encoderCanvas = document.createElement('canvas');
}
AnimatedEncoder.prototype.initAnimation = function(){
	//do stuff needed to initialize
	//GIF needs to come up with a common palette selection,
	//Other formats need other stuff
	if(this.format=='gif'){
		
	}
};
/*
Animated WEBP:
(made of RIFF chinks (FourCC,))
(note that WEBP integers are unsigned LITTLE ENDIAN)
RIFF/WEBP header
contents{
	VP8X chunk
	ANIM chunk (global animation paramz)
	ANIMF (frame1 paramz and data)
	ANIMF (frame2 paramz and data)
	...
	ANIMF (frameX paramz and data)
}

*/
AnimatedEncoder.prototype.addFrame = function(frameParamz){
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
	this_this = this;
	if(frameParamz.image){
		this.addFrameFromImage(frameParamz);
	}else if(frameParamz.file){
		//if input is not from <img>, an image must be generated first.
		
		var fImg = document.createElement('img');
		fImg.file = frameParamz.file;
		var fRead = new FileReader();
		fRead.onload = (function(imagin){return function(e){imagin.src=e.target.result;};})(fImg);
		fRead.readAsDataURL(fImg.file);
		frameParamz.image = fImg;
		fImg.onload = function(imgLoadInput){
			//once src is set, this will load and image will have data
			this_this.addFrameFromImage(frameParamz);
		};
	}else if(frameParamz.url){
		
	}
}
AnimatedEncoder.prototype.addFrameFromImage = function(frameParamz){
	//Note: must use .clientWidth, .clientHeight to measure added image.
	//.width/height will be 'initial' without a number value
	//TODO: maybe a reverse mode where it uses MINIMUM sizes?
	if(this.autoDim){//autoDim will need to expand to fit all images.
		alert('autoDim updated from '+this.width+'x'+this.height+' ...');

		//note: clientWidth/H always returning 0
		//it may have to be active in the page to have that
		//value poulated    (be in the DOM tree)
		this.width  = Math.max(frameParamz.image.clientWidth,this.width);
		this.height = Math.max(frameParamz.image.clientHeight,this.height);

		alert('...to '+this.width+'x'+this.height);
	}
	//frames should be added and size detected if autoDim,
	//then processing will be done afterwards.
	this.frames.push(frameParamz);
	//alert('frame added, now there are '+this.frames.length);
}
AnimatedEncoder.prototype.procFrame = function(){
	var frameImg = this.frames[this.frameBeingProcessed].image;
	this.encoderCanvas.width = this.width;
	this.encoderCanvas.height = this.height;
	ctx = this.encoderCanvas.getContext('2d');
	ctx.drawImage(frameImg,0,0);
	//alert('quality: '+this.quality);
	var datB64 = this.encoderCanvas.toDataURL('image/'+this.sourceFormat,parseFloat(this.quality));

	//var datB64 = this.frames[this.frameBeingProcessed];
	//must strip:
	//data:image/png;base64, (22)
	//data:image/gif;base64, (22)
	//data:image/webp;base64, (23)
	var stripB64 = 22;
	if(this.sourceFormat=='webp'){stripB64 = 23;}
	//alert('datB64: '+datB64);
	//alert('stripped: '+datB64.substring(stripB64));
	var raw8 = this.string2uint8(atob(datB64.substring(stripB64)));
	//alert('dat8 len: '+raw8.length);
	//alert('dat8: '+String.fromCharCode.apply(null,raw8));
	var chunkSig;//aka 'FourCC'
	var chunkLen;
	var seekPos = 0;
	if(this.frameBeingProcessed==0){
		if(this.format=='png'){
			
		}
		if(this.format=='webp'){
			
		}
	}
	
	//########################### PNG ########################
	if(this.sourceFormat=='png'){
		//Skip:
		//(1) 0x89
		//(3) PNG
		//(4) CRLF, EOF, UnixLineFeed
		seekPos = 8;
		while(seekPos<raw8.length){
			chunkSig = String.fromCharCode.apply(null,raw8.subarray(seekPos+4,seekPos+8));
			chunkLen = raw8[seekPos]*0x1000000+raw8[seekPos+1]*0x10000+raw8[seekPos+2]*0x100+raw8[seekPos+3];//Big Endian
			alert('chunk: '+chunkSig+' len: '+chunkLen);
			if(chunkSig == 'IDAT'){
				this.payloads.push(raw8.subarray(seekPos,seekPos+chunkLen+8));//include FourCC and length itself (8)
				alert('adding '+(chunkLen+8)+'-byte payload');
				break;
			}
			seekPos += chunkLen+8;
		}
	}//====================END PNG============================
	//########################### WEBP #######################
	if(this.sourceFormat=='webp'){
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
	var this_this = this;//works around access bugs with 'this'
	if(this.onProgress){
		//allow devs to create a progress bar to show the image is being built
		//by setting up this function which accepts a float of 0.0-1.0
		//half of the progress will be tracked in writing the octet stream,
		//the other half here, building payloads.
		this.onProgress(0.5*Math.min(this.frameBeingProcessed/this.frames.length,1));
	}
	if(this.frameBeingProcessed<this.frames.length){
		//put a delay between each frame because image encoding
		//can be very resource hungry, even with the browsers
		//native or even hardware-accelerated encoding.
		setTimeout(function(){this_this.procFrame()},100);
	}else{//all frame bitstreams encoded and ready to be packed into file.
		setTimeout(function(){this_this.packAnimatedFile()},100);
	}
};
AnimatedEncoder.prototype.saveAnimatedFile = function(){
	if(this.onProgress){this.onProgress(0);}
	this.outputString = '';//intermediate state before base64 conversion can be done.
	this.payloads = [];
	this.frameBeingProcessed = 0;
	this.procFrame();
}

AnimatedEncoder.prototype.packAnimatedFile = function(){
	var outputLen = 0;
	var out8;
	var i;
	var chunkSig;
	var numVal;
	var writePos = 0;
	var payload;
	var p;
	//(NOTE: webp/webm may need logic to swap out VP8 for VP9/VP10, etc
	//if it is detected that through a browser update, this has become
	//the output of Canvas.toDataURL('webp'))
	//===============================WEBP==================================
	if(this.format == 'webp'){
		outputLen += 12;//RIFF,uint32,WEBP
		outputLen += 18;//VP8X extension chunk needed for animation
		outputLen += 14;//ANIM global animation parameters needed
		
		//for(i=0;i<1;i++){
		for(i=0;i<this.payloads.length;i++){
			outputLen += 24;//ANMF chunk needed for each frame
			outputLen += this.payloads[i].length;
			//alert('payload['+i+'] has: '+this.payloads[i].length);
		}
		//alert('creating target octet with size: '+outputLen);
		out8 = new Uint8Array(new ArrayBuffer(outputLen));
		
		this.writeChunkSig(out8,'RIFF',0);
		this.writeUint32(out8,outputLen-8,4,true);
		this.writeChunkSig(out8,'WEBP',8);
		
		this.writeChunkSig(out8,'VP8X',12);
		this.writeUint32(out8,10,16,true);//length of contents (not including VP8X & length)
		//out8[20] = 0x00;//testing VP8X without animation
		out8[20] = 0x02;//packed field, just set animation bit on, alpha bit is hint only and alpha not currently working in canvas.toDataURL('image/webp') as of early 2016 anyways
		this.writeUint24(out8,0,21,true);//reserved bits that should be 0
		this.writeUint24(out8,this.width-1,24,true);//width-1
		this.writeUint24(out8,this.height-1,27,true);//height-1
		
		this.writeChunkSig(out8,'ANIM',30);
		this.writeUint32(out8,6,34,true);//length of contents (not including ANIM & length)
		this.writeUint32(out8,0,38,true);//BGColor, just setting to 0x00000000
		out8[42] = 0;//16-bit loop count, leave 0 for infinite.
		out8[43] = 0;
		writePos = 44;
		//writePos = 30;
		//writePos = 12;
		//for(i=0;i<1;i++){//testing with a simple WEBP
		for(i=0;i<this.payloads.length;i++){
			payload = this.payloads[i];
			this.writeChunkSig(out8,'ANMF',writePos);
			this.writeUint32(out8,16+payload.length,writePos+4,true);//length of ANMF (which INCLUDES a VP8/VP8L chunk at the end of it contained within the ANMF)
			this.writeUint24(out8,0,writePos+8,true);//x
			this.writeUint24(out8,0,writePos+11,true);//y
			this.writeUint24(out8,this.width-1,writePos+14,true);//width-1
			this.writeUint24(out8,this.height-1,writePos+17,true);//height-1
			this.writeUint24(out8,this.delay,writePos+20,true);//duration (milliseconds)
			out8[writePos+23]= 0x00;//1 byte here can be skipped (left all 0)
				//6 reserved bits and alphablend/dispose which are not usable with the only option of full frame updates (no way of giving frame back references in toDataURL)
			writePos += 24;
			for(p=0;p<payload.length;p++){
				out8[writePos+p] = payload[p];
			}
			writePos += payload.length;
		}
		
	}//============================== END WEBP ==============================
	//=============================== WEBP ==================================
	if(this.format == 'webm'){
		/*
(EMBL is Big Endian)
opt = optional
mnd = mandatory
a length byte of all 1's (11111111) means it is a list of EBML sub elements.
There is no end marker. it ends based on the ID of a property when
a property is encountered that is not a defined sub-element of that parent entry
This must be guessed based on the doctype's definition of IDs

EMBL Header(Lv 0, multi, total: 11 bytes)
ID = 0x1A45DFA3
			//Should inherit mandatory properties
			//from the Matroska Spec.
			//and override some things that WEBM changes
			{4} 
			                 |ID        |Length   |Payload
  EBMLVer.     {4} (0x4286,    0x81,     0x01)
  EBMLReadVer. {4} (0x42F7,    0x81,     0x01)
  MaxIDLen.    {4} (0x42F2,    0x81,     0x04)
  MaxSizeLen.  {4} (0x42F3,    0x81,     0x08)
  DocType      {7} (0x4282,    0x84,     'webm')
  DocTypeVer.  {4} (0x4287,    0x81,     0x02) (look into this not sure)
  DocT.ReadVer.{4} (0x4285,    0x81,     0x02)


Segment(Lv 0, multi) (All top-level fields, the whole rest of the file)
ID=0x18538067
  Info(Lv 1, multi)
  ID=0x1549A966
    Title <opt,UTF-8>      {0x7BA9, }
    DateUTC <opt,UTF-8>      {0x7BA9, }
    TimecodeScale <uint>    {0x2AD7B1, 0x83, 0x0F4240}
		time measuring unit. 1,000,000 means milliseconds
    Duration <float>        {}
    MuxingApp <mnd,UTF-8>       {0x4D80, 0x9C, 'Deckromancy Animated Encoder'}
    WritingApp <mnd,UTF-8>      {0x5741, 0x9C, 'Deckromancy Animated Encoder'}
                                      x-- 1001_1100 (first bit is expansion indicator)
  Tracks(Lv 1, multi)
  ID=0x1654AE6B
    Track Entry(Lv 2, multi)
    ID=0xAE
       TrackNumber <mnd,uint>   {0xD7, 0x8?, 'Deckromancy Animated Encoder'}
       CodecID      {4} (0x86,      0x85,     'V_VP8' or 'V_VP9')
       (No CodecPrivate data for VP 8/9)
       CodecName    {4} (0x86,      0x83,     'VP8' or 'VP9')(not sure if needed?)

			{}
			{7} Doctype, [2] ID = 0x4282,
					[1] byte length = 0x84 = 10000100, meaning 4
						(first bit defines 1 byte length size)
						(In Unicode fashion, each leading 0 adds an expansion byte)
					[4] Payload = 'webm'
			{} DoctypeReadVersion, [2] ID = 0x4285
						[1] length = 0x81, meaning 1
						[1] Payload = 0x02
		*/
		outputLen = 4;
	}//============================== END WEBM ==============================

	if(this.format == 'png'){
		outputLen += 8;//Header&MagicNumber
		outputLen += 25;//IHDR (whole chunks include length,sig,data,CRC)
		outputLen += 38;//fcTL 
		for(i=0;i<this.payloads.length;i++){
			outputLen += 24;//ANMF chunk needed for each frame
			outputLen += this.payloads[i].length;
			//alert('payload['+i+'] has: '+this.payloads[i].length);
		}
		outputLen += 12;//IEND (empty chunk)
	}
	//alert('before outputOctetStream set');
	this.outputOctetStream = out8;
	
	//alert('after outputOctetStream set: '+this.outputOctetStream.length);
	this.chunkPackI = 0;
	this.packChunk();
	
	//alert('outputOctetStream: '+String.fromCharCode.apply(null,out8));
	
}
AnimatedEncoder.prototype.packChunk = function(){
	//alert('pack: len: '+this.outputOctetStream.length);
	if(this.chunkPackI<this.outputOctetStream.length){
		this.outputString += String.fromCharCode.apply(null,this.outputOctetStream.subarray(this.chunkPackI,Math.min(this.outputOctetStream.length,this.chunkPackI+2048)));
		this.chunkPackI += 2048;
		var this_this = this;//needed to stop breakage.
		setTimeout(function(){this_this.packChunk()},100);//must wrap function this way or it will break variables
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
}
AnimatedEncoder.prototype.string2uint8 = function(str){
	var u8 = new Uint8Array(new ArrayBuffer(str.length));
	for(var i=0;i<str.length;i++){
		u8[i] = str.charCodeAt(i);
	}
	return u8;
};
AnimatedEncoder.prototype.writeChunkSig = function(out8,chunkSig,pos){
	out8[pos+0] = chunkSig.charCodeAt(0);
	out8[pos+1] = chunkSig.charCodeAt(1);
	out8[pos+2] = chunkSig.charCodeAt(2);
	out8[pos+3] = chunkSig.charCodeAt(3);
}
AnimatedEncoder.prototype.writeUint32 = function(out8,u32,pos,isLittleEndian){
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
}
AnimatedEncoder.prototype.writeUint24 = function(out8,u24,pos,isLittleEndian){
	if(isLittleEndian){
		out8[pos+0] = u24&0xFF;
		out8[pos+1] = u24>>8&0xFF;
		out8[pos+2] = u24>>16&0xFF;
	}else{
		out8[pos+0] = u24>>16&0xFF;
		out8[pos+1] = u24>>8&0xFF;
		out8[pos+2] = u24&0xFF;
	}
}
