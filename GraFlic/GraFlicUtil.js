/*
This is a collection of utilities used by web-apps that utilize the GraFlic libraries such as GraFlicEncoder at:
AnimatedPNGs.com
Deckromancy.com

The GraFlic utilities include several static functions commonly needed and classes commonly needed like GraFlicArchive for reading/writing ZIP files.

=============================================================================
The MIT License (MIT)
Copyright (c) 2017 - 2017 Compukaze LLC
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

For the ZIP read/write functions, the Deflate library pako is used for compression / decompression of ZIP components that are compressible. pako is chosen over Zopfli for these particular tasks, because it has greater speed. The brute force compression of Zopfli is not needed as much since these are mostly ZIP-based save files to save and restore work on a project from a web app. Zopfli is ideal for something like the final version of an Animated PNG that will be placed on the web and downloaded many times over.

https://github.com/nodeca/pako/ (MIT License)

*/
'use strict';

//Currently all functions are static, but if there are instances needed do:
function GraFlicUtil(paramz){
	
};

/*.loadFromZIP() and .saveToZIP() allow web apps to base save files on the ZIP standard that has been ubiquitous for decades.
The goal is to be able to easily read and write the state of JSON and other data like Uint8Arrays in memory in the JS app to be able to save and load the state later.
In many cases it is as simple as doing JSON.stringify on a root object. In some cases, some special processing may be required for certain properties. For example if on of the properties is Uint8Array, it will be impractical to include that as part of a JSON string.
Since the goal of this is restoring the state of a JS web app, '.json' files will be automatically parsed into a JS object.
*/
/*
GraFlicArchive() constructor takes a Uint8Array and optional parameters.

.files is an Object that has properties, who are named with strings based on the filename, including any folder path if applicable. Use a for loop to cycle thru the files or if the save has preset filenames that control parts of the save, access them directly.
Examples:
ga.f('save.json');
ga.f('images/example.png');
ga.f('bitmap.dat.gz');//Get the file for live access. If it has not already been fully decompressed and reconstituted the f() quick function will do that so that the returned virtual file object is ready to use.
Each file in files is an object and will have .d (data) for the raw binary, and in some cases have .b (blob link) with the ObjectURL blob link.
Other properties may be added later.
Maybe a .metadata to retain metadata about files like creation/modification time?
*/
function GraFlicArchive(zipDataUint8, paramz){
	//'this' object will be returned to the caller with contents of the ZIP.
	this.files = {};//each file will have potentially .d (data) containing the files, extracted and decompressed. The filename will be the key to access the file object in files. JSON will have .json containing the reconstituted JSON object. Text will have .t (text) containing the text string. JSON and text do not currently fill the .d property because it would not be very useful and would waste resources.
	//Images(PNG/JPG/GIF/WEBP) will have their raw binary appear in files in case metadata needs examining, and will also have an ObjectURL put here in images for easy loading by DOM elements in .b (blob link).
	//Other properties may be added to this result object later if needed.
	
	GraFlicArchive.archives.push(this);//Each archive created will be tracked here so that a file can be looked up if the path exists in any archive in memory with static getFileFromAny()
	var zj = null;//will be populated if z.json type validator found.
	var bloatFolder = null;//null for N/A, will be used to fix a common packaging mistake that wraps an extra folder around everything.
	if(!paramz){
		paramz = {};//makes handling undefined vars easier if paramz.x is undefined it can just send undefined for optional x if needed without getting 'paramz is undefined'
	}
		/*
		if(paramz.globalAsset){
			//being called with globalAsset true will tell it to keep the files in memory and set up the linkage so that the file can be used to fill custom zip links within the page with the images once they are extracted.
			//This is used when the custom:link rel="archive" element is detected to say that the page uses images/files stored in a zip file.
		}
		*/
	if(!zipDataUint8){
		//If called without a binary ZIP to load, make a blank GraFlicArchive that can be filled with files programmatically and saved.
		/*
		var paramApps = undefined;
		if(paramz.app){//Single app string, convert to array for z.json
			paramApps = [paramz.app];
		}
		if(paramz.apps){
			paramApps = paramz.apps;//.apps plural sent should be sent as array
		}
		//Note that these extra parameters and logic may not be needed. It may be better to just set the properties of the z.json object after the GraFlicArchive is initialized to match what the given software or format needs. This would simplify the constructor. Falling back to the generic application/octet-stream type will probably not be devastating if properties are not customized after creation.
			//paramz.mime, paramz.type, paramApps);
		*/
		this.addMetaZIP();
		return;
	}
//Note when reading, other ZIP builders may insert data descriptor after local file header and payload, which apparently may or may not use a signature...
	//Writing data descriptors is turned of in the save function used here with general purpose bit 3 set to 0.
	var v_oct = zipDataUint8;
	var v_pos;
	var v_i;
	var v_entrySize;
	var v_filename;
	var v_filenameSize;
	var v_cdFilenameSize;
	var v_extraFieldSize;
	var v_cdExtraFieldSize;
	var v_commentSize;
	var v_payloadCompression;
	var v_payloadSize;
	var v_payloadUncompressedSize;
	var v_extractedBytes;
	var v_fileHeadStart;
	//var v_calcCRC32;
	var v_readCRC32;
	var v_compSig;//component signature
	var v_bitFlags;
	var v_relOffset;
	//OLD, incorrect: var v_offsetMode = 0;//0 for normal, 1 for undocumented mode some writers use that store the offset from the start of the file.
	console.log('Starting ZIP read. size: ' + v_oct.length);
	//First find the start of the end of central directory, it has a variable length comment field so may not be in a set spot.
	var v_cdPos = v_oct.length - 1;//Read the zip starting with the central directory at the end. This is more reliable, since the length and CRC may not be available in the local file header.
	//IT MUST start by reading the End of Central Directory section. since there is only a comment field with in the EoCD the chances of collisions with the signature are near-zero when going in reverse to find the start of it.
	//reading thru the files from the start will not work because the length fields are not guaranteed to be filled in. In that case, one would have to scan for the start of Data Descriptor signature after the file to get the length. With large sections of binary there are high chances of collisions with the Data Descriptor signature.
	var v_cdSig = 0;
	while(v_cdSig != 0x06054B50){
		v_cdPos--;
		v_cdSig = GraFlicEncoder.readUint32(v_oct, v_cdPos, true);
		//console.log(v_cdSig.toString(16));
	}
	var v_filesCountZIP = GraFlicEncoder.readUint16(v_oct, v_cdPos + 10, true);//Number of entries in central directory.
	var v_filesRead = 0;
	var v_cdStart = GraFlicEncoder.readUint32(v_oct, v_cdPos + 16, true);//Where the central directory starts
	v_cdPos = v_cdStart;
	while(v_filesRead < v_filesCountZIP){
		console.log('CentDir pos: ' + v_cdPos + ' sig: ' + GraFlicEncoder.readUint32(v_oct, v_cdPos, true).toString(16));
		v_relOffset = GraFlicEncoder.readUint32(v_oct, v_cdPos + 42, true);
		//if(v_relOffset == 0){v_offsetMode = 1;}
		//0 is never valid for the offset from central directory defined in the spec. If the first offset is 0, it must use the undocumented mode that uses the offset from the start of the file.
		//if(v_offsetMode == 1){
		v_fileHeadStart = v_relOffset;//In ZIP 2.0, it is always the position from the beginning of the file, the other way was incorrect.
		//}else{
		//	v_fileHeadStart = v_cdPos - v_relOffset;//go backwards by the offset bytes to locate the local file header.
		//}
		console.log('version made by, version: ' + v_oct[v_cdPos + 4] + ' OS: ' + v_oct[v_cdPos + 5]);
		console.log('version needed to extract, version: ' + v_oct[v_cdPos + 6] + ' OS: ' + v_oct[v_cdPos + 7]);
		console.log('rel offset: ' + v_relOffset + ' starting at: ' + v_fileHeadStart);
		v_pos = v_fileHeadStart;
		v_readCRC32 = GraFlicEncoder.readInt32(v_oct, v_cdPos + 16, true);
		v_payloadSize = GraFlicEncoder.readUint32(v_oct, v_cdPos + 20, true);//Read size out of central directory where it should be calculated. In the local file header it may be undefined if bit 3 of the flags is set. So far, this seems to reliably work to get payload size.
		v_payloadUncompressedSize = GraFlicEncoder.readUint32(v_oct, v_cdPos + 24, true);

		v_cdFilenameSize = GraFlicEncoder.readUint16(v_oct, v_cdPos + 28, true);
		v_cdExtraFieldSize = GraFlicEncoder.readUint16(v_oct, v_cdPos + 30, true);//The extra field on central directory might be different from local file header.
		v_commentSize = GraFlicEncoder.readUint16(v_oct, v_cdPos + 32, true);//Comment ONLY appears on central directory header, NOT the local file header.

		//console.log('i att(L): ' + GraFlicEncoder.readUint16(v_oct, v_cdPos + 36, true).toString(2));
		//console.log('x att(L): ' + GraFlicEncoder.readUint32(v_oct, v_cdPos + 38, true).toString(2));

		console.log('local file header sig: ' + GraFlicEncoder.readUint32(v_oct, v_pos, true).toString(16));
		v_bitFlags = GraFlicEncoder.readUint16(v_oct, v_pos + 6, true);
		v_payloadCompression = GraFlicEncoder.readUint16(v_oct, v_pos + 8, true);
		v_filenameSize = GraFlicEncoder.readUint16(v_oct, v_pos + 26, true);
		v_extraFieldSize = GraFlicEncoder.readUint16(v_oct, v_pos + 28, true);
		v_pos += 30;
		
		v_filename = GraFlicEncoder.readStringUTF8(v_oct, v_pos, v_filenameSize);
		//OLD only ASCII compatible: v_filename = String.fromCharCode.apply(null, v_oct.subarray(v_pos, v_pos + v_filenameSize));
		v_pos += v_filenameSize;
		v_pos += v_extraFieldSize;//This app does not use extra field, but check for it in case the ZIP was edited and repackaged by another ZIP writer.
		
		v_cdPos += 46 + v_cdFilenameSize + v_cdExtraFieldSize + v_commentSize;//Advance to the next central directory header for the next file.
		
		console.log('Central Directory sizes:  filename: ' + v_cdFilenameSize + ' comment: ' + v_commentSize + ' extra: ' + v_cdExtraFieldSize);
		console.log('Reading ' + v_filename + ' out of ZIP.');
		console.log('Local File Header sizes: payload: ' + v_payloadSize + ' filename: ' + v_filenameSize + ' extra: ' + v_extraFieldSize);
		console.log('bit flags: 0x' + v_bitFlags.toString(16));
		
		
		if(v_filename.match(/desktop\.ini$/) || v_filename.match(/__MACOSX\//) || v_filename.match(/\.DS_Store$/)){
				// || v_filename.match(/(^|\/)\./)){           // || v_filename.match(/\..*\./)){
			//Detect and throw out apparent non-user, OS-generated files.
			//If a user repackages or builds a ZIP-based file with another packaging tool, these can end up creeping into the archive and they are not needed for the ZIP-based formats.
			//Throw out files that start with a dot??
			//These are probably system generated junk files, the save format does not use files named this way.
			//However some users may have designed archives specifically using these types of files for some reason...
			//In *nix operating systems starting with a dot(.) is a hidden file, often some kind of system file.
			console.log('Skipping apparently irrelevant file: ' + v_filename);
		}else{
			v_extractedBytes = v_oct.subarray(v_pos, v_pos + v_payloadSize);
				//CRC is based on BEFORE being compressed, it will not be uncompressed until accessed...
				//incorrect v_calcCRC32 = GraFlicEncoder.getCRC32(v_extractedBytes, 0, v_payloadSize);
				//console.log('CRC calculated: ' + v_calcCRC32 + ' CRC read: ' + v_readCRC32);
			var xFile = {};
			xFile.reconst = false;//Has not been reconstituted. This will be done as needed if the file is accessed via .f('filepath'). That way resources are saved by not making every file live on load when not all files may be used right away, if even used at all.
			xFile.compression = v_payloadCompression;//Compression method code as defined by ZIP.
			xFile.uncompressed_size = v_payloadUncompressedSize;//Will need to know what size the original file is if re-packaging it.
			xFile.zip_crc = v_readCRC32;//save the CRC that was generated over the full uncompressed payload by the ZIP packager.
			//console.log('uncompressed size: ' + uncompressed_size);
			xFile.p = v_filename;//keep a reference for what the path is in case object referenced elsewhere.
			
			xFile.d = v_extractedBytes;//These bytes will be decompressed later if the archived file entry is reconstituted.
			this.files[v_filename] = xFile;//if completed with no errors, include it in the files object
			console.log('----------------------');
			if(v_filename.match(/(^|\/)z\.json$/)){
				console.log('.-.-.-.-.z.json type validator.-.-.-.-.-.');
				zj = this.f(v_filename).j;
				if(zj.z_signature == 'z.json metadata'){//verify it is for this purpose
					console.log('confirmed to be type validator z.json v' + zj.z_version);
					var partsZJ = v_filename.match(/^(.*\/)z\.json$/);//detect a bloat folder if packaging mistake was made.
					if(partsZJ && partsZJ[1] && partsZJ[1].length){
						bloatFolder = partsZJ[1];
						console.log('User apparently made common mistake of packaging everything wrapped in an extra bloat folder. The bloat folder(' + bloatFolder + ') will be stripped from paths.');
					}
				}
				console.log('.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.');
			}
		}
		v_filesRead++;
	}//end while
	if(bloatFolder){//Remove the bloat folder portion from paths if a packaging mistake resulted in things being wrapped in a bloat folder. The next time this is saved by an app using GraFlicArchive, it will be properly packaged without the bloat folder.
		var unbloatedFiles = {};
		for(var key in this.files){
			var bRepFile = this.files[key];
			bRepFile.p = bRepFile.p.replace(new RegExp('^' + bloatFolder), '');
			unbloatedFiles[bRepFile.p] = bRepFile;
		}
		this.files = unbloatedFiles;
	}
};//(semicolon not needed since function definition not = function, but it appears to not effect things being here...) end of GraFlicArchive() constructor
GraFlicArchive.prototype.addFile = function(v_fileAdded){
	//required params:
	//.p (path) -- if path string ends in '/' it will be considered a directory.
	//some content, unless it is a folder
	//(.d (data) or .j (json) or .t (text) )
	//other properties:
	//.b - blob link, will be created based on .d data if present
	//.temp - if defined true, this will not be saved in the archive binary
		//In many cases there is temp data needed to function at run time but not needed in the save.
		//Setting these things up with separate logic can cause bloat and lots of redundant code in some cases.
		//For the sake of consistency and keeping the code trimmed down, adding it to the archive but setting .temp may be better.
	
	//A file added at runtime with addFile() will be considered uncompressed and already reconstituted.
	//An addArchivedFile() and/or archiveFile() function can be added if there is a need for adding files that should not be run-time live.
	//Note that when accessing the properties of the file always get the file object and go from there. The properties such as .d .j .b etc may be overwritten with new objects and saving a link to them for later could be linking to a stranded object that is supposed to be garbage collected.
	//When adding a file in this way note that the data .d property may not be set for types such as text or JSON that were built from live strings or JSON objects.
	v_fileAdded.reconst = true;
	v_fileAdded.compression = 0;//File stored code as defined by ZIP.
	
	if(v_fileAdded.p.match(/\/[^\/]+$/)){//If a file, ensure the containing directory exists.
		var v_contDir = {};
		v_contDir.p = v_fileAdded.p.match(/^(.+\/)[^\/]/)[1];
		if(!this.files[v_contDir.p]){//If the folder already exists, leave it as it is. It may have properties like .temp set that should not be overwritten.
			this.addFile(v_contDir);//(If the containing folder is in a folder, this will be done again in the recursive call.)
		}
	}
	if(this.files[v_fileAdded.p] && this.files[v_fileAdded.p].b){
		//If overwriting the file, first destroy the previous blob
		URL.revokeObjectURL(this.files[v_fileAdded.p].b);
	}
	this.files[v_fileAdded.p] = v_fileAdded;
	this.fileToLiveBLOB(v_fileAdded);
};//end .addFile()
GraFlicArchive.prototype.deleteFile = function(v_fPath){
	if(this.files[v_fPath]){
		if(this.files[v_fPath].b){
			URL.revokeObjectURL(this.files[v_fPath].b);
		}
		var v_fPathNoExt = v_fPath.replace(/\.[^\.]+(\.gz)?$/i, '');
		delete this.files[v_fPath];
	}else{
		console.log('deleteFile(): ' + v_fPath + ' does not exist.');
	}
};
GraFlicArchive.prototype.fileToLiveBLOB = function(f){
	if(f.d && f.d.length){//BLOB creation may not be possible if .d (data) not set. BLOBs are mainly needed for things like images, which will have that
			//Folders may extract as a 0 length octet stream and do not need a BLOB.
		var objParamz = {};
		objParamz.type = 'application/octet-stream';
		//.gz will be auto decompressed on load, and auto-compressed internally on save (before being stored in the ZIP with method 0 no compression)
		var v_isImg = false;
		var v_isJPEG = f.p.match(/\.jpe*g(\.gz)?$/i);
		if(f.p.match(/\.a*png(\.gz)?$/i)){objParamz.type = 'image/png';v_isImg = true;}
		if(v_isJPEG){objParamz.type = 'image/jpeg';v_isImg = true;}
		if(f.p.match(/\.gif+(\.gz)?$/i)){objParamz.type = 'image/gif';v_isImg = true;}
		if(f.p.match(/\.webp(\.gz)?$/i)){objParamz.type = 'image/webp';v_isImg = true;}
		if(f.p.match(/\.txt(\.gz)?$/i)){objParamz.type = 'text/plain';}
		if(f.p.match(/\.json(\.gz)?$/i)){objParamz.type = 'application/json';}
		
		f.b = URL.createObjectURL(  new Blob([f.d], objParamz)  );
		if(v_isImg){//Create drawable image objects for images. The point of embedding images in web-app saves is to draw them!
			f.i = new Image();
			f.i.src = f.b;
			f.i.alt = f.p;//This can be used to look up file on load event. The image will typically not be placed in the DOM, but be used as a drawable on a canvas.
			f.i.title = f.p;
			//Some things need to know when an image has been loaded and redraw with the image visuals available.
			//JPEGs may need to be fixed due to exif rotation.
			if(v_isJPEG){
				f.i.temp_octetStream = f.d;
			}
			f.i.addEventListener('load', GraFlicArchive.onImageLoadedHandler.bind(this));
		}
		//f.d is already required at the start of this func
		if(GraFlicDecoder){
			if(f.p.match(/\.a*png(\.gz)?$/i)){
				//Check to see if this is an Animated PNG (If GraFlicDecoder class is present)
				var sig, len, pos = 33;//Skip magic number, IHDR, etc
				while(pos < f.d.length){
					len = GraFlicEncoder.readUint32(f.d, pos);
					sig = GraFlicEncoder.readFourCC(f.d, pos + 4);
					//console.log('reading thru PNG for Archive LiveBLOB[' + pos +'], sig: ' + sig);
					pos += 12 + len;//Skip sig, len, CRC
					if(sig == 'acTL'){//Animation Control
						//Set up .a as a GraFlicDecoder object handling an Animated PNG. This allows freeze frame for apps that need to draw it at a certain frame or sync frames across multiple animations.
						f.a = new GraFlicDecoder(f.b);
						break;
					}
				}
			}
			if(f.p.match(/\.gif+(\.gz)?$/i)){
				//ALWAYS make the decoder for GIF. Non-Animated GIF is a rarity anymore so do not split hairs over extra resources of building a 1-frame decoder in that rare case. Do not need excessive file analyzing here.
				f.a = new GraFlicDecoder(f.b);
			}
		}
	}
};//end .fileToLiveBLOB()
GraFlicArchive.prototype.listDir = function(v_dir){
	//Returns an array of files that are in the directory.
	var ls = [];
	for(var k in this.files){
		if(this.files[k].p.indexOf(v_dir) == 0 && this.files[k].p != v_dir){//The dir path is at the start of the file path
			ls.push(this.files[k]);//make sure to send the file from files[] do NOT use .f('name.txt'), that would for reconstitution of a file that may have been never used. This is just listing what files are there.
		}
	}
	return ls;
};
GraFlicArchive.onImageLoadedHandler = function(e){
	//Setting up .onImageLoaded allows for apps using GraFlicArchive to refresh drawing when an image becomes loaded and drawable.
	//Have the event done from this internal handler, then call the function given assigned to onImageLoaded. This way listener cleanup is done automatically.
	if(this.onImageLoaded){
		var loadResult = {};//Send an object as the result that has links to basic things related to the load.
		loadResult.event = e;
		loadResult.archive = this;//Event used bind(this)
		loadResult.file = this.files[e.target.alt];//do not potentially loop in odd cases with .f()
			
		this.onImageLoaded(loadResult);
	}
	var imgObj = e.target;
	imgObj.removeEventListener('load', GraFlicArchive.onImageLoadedHandler);
	var v_img8 = imgObj.temp_octetStream;//May be undefined, and will eval false.
	if(v_img8 && v_img8[0] == 255 && v_img8[1] == 216 ){//JPEG start of image (SOI) marker
		var v_exifOri = -1;//-1 for not there
		//alert('JPG!');
		var v_jSigA = v_img8[2];//APP Marker Signature
		var v_jSigB = v_img8[3];
		var v_img8I = 4;//Skip SOI and app marker signature.
		var v_chunkSig;
		while(!(v_jSigA == 0xFF && v_jSigB == 0xDA)){//Exit if end of image (SOS)
			v_chunkSig = String.fromCharCode(v_img8[v_img8I+2]) + String.fromCharCode(v_img8[v_img8I+3])
				  + String.fromCharCode(v_img8[v_img8I+4]) + String.fromCharCode(v_img8[v_img8I+5]); 
			//alert(v_chunkSig + ' sig ' + v_img8I);
			if(v_chunkSig == 'Exif'){
				var v_exifI = v_img8I + 6;
				var v_iiAlign =  v_img8[v_exifI + 2] == 0x0049;
				v_exifI += 6;
				var v_idOffset;
				if(v_iiAlign){
					v_idOffset = v_img8[v_exifI]
						  + v_img8[v_exifI + 1] * 0x100
						  + v_img8[v_exifI + 2] * 0x10000
						  + v_img8[v_exifI + 3] * 0x1000000; 
				}else{
					v_idOffset = v_img8[v_exifI]    * 0x1000000
						  + v_img8[v_exifI + 1] * 0x10000
						  + v_img8[v_exifI + 2] * 0x100
						  + v_img8[v_exifI + 3]; 
				}
				//alert('iialig: ' + v_iiAlign);
				//alert('offset ' + v_idOffset);
				v_exifI += 4 + v_idOffset - 8;
				var v_exifNEntries;
				if(v_iiAlign){
					v_exifNEntries = v_img8[v_exifI]
						      + v_img8[v_exifI + 1] * 0x100; 
				}else{
					v_exifNEntries = v_img8[v_exifI] * 0x100
						      + v_img8[v_exifI + 1]; 
				}
				v_exifI += 2;
				//alert('n entries: ' + v_exifNEntries);
				for(var v_exLoopI = 0;v_exLoopI < v_exifNEntries;v_exLoopI++){
					var v_exifTagType = v_iiAlign? v_img8[v_exifI] + v_img8[v_exifI + 1] * 0x100
								      : v_img8[v_exifI] * 0x100 + v_img8[v_exifI + 1];
					v_exifI += 2;
					var v_exifTagFormat = v_iiAlign? v_img8[v_exifI] + v_img8[v_exifI + 1] * 0x100
								      : v_img8[v_exifI] * 0x100 + v_img8[v_exifI + 1];
					v_exifI += 2;
					var v_exifTagComp = v_iiAlign?   v_img8[v_exifI] +               v_img8[v_exifI + 1] * 0x100 //number of components
								      + v_img8[v_exifI + 2] * 0x10000 + v_img8[v_exifI + 3] * 0x1000000
								    :   v_img8[v_exifI] * 0x1000000 +   v_img8[v_exifI + 1] * 0x10000
								      + v_img8[v_exifI + 2] * 0x100 +   v_img8[v_exifI + 3];
					v_exifI += 4;
					var v_bytesPerComp = 1;
					if(v_exifTagFormat == 3 ){v_bytesPerComp = 2;}
					if(v_exifTagFormat == 4 ){v_bytesPerComp = 4;}
					if(v_exifTagFormat == 5 ){v_bytesPerComp = 8;}
					if(v_exifTagFormat == 8 ){v_bytesPerComp = 2;}
					if(v_exifTagFormat == 9 ){v_bytesPerComp = 4;}
					if(v_exifTagFormat == 10){v_bytesPerComp = 8;}
					if(v_exifTagFormat == 11){v_bytesPerComp = 4;}
					if(v_exifTagFormat == 12){v_bytesPerComp = 8;}
					var v_dataOrOffset = 1;
					if(v_exifTagComp * v_bytesPerComp > 4){//If more than 4 bytes long, it is a 4 byte offset to where data starts.
						v_exifI += 4;
					}else{
						if(v_exifTagFormat == 3){//This is used by Orientation, the only Exif data currently needed.
							v_dataOrOffset = v_iiAlign ? v_img8[v_exifI] + v_img8[v_exifI + 1] * 0x100
										    : v_img8[v_exifI] * 0x100 + v_img8[v_exifI + 1];
						}
					}
					if(v_exifTagType == 274){
						v_exifOri = v_dataOrOffset;
//Orientation values:
//0001 1 = Normal
//0010 2 = Mirror horizontally
//0011 3 = Rotate 180 degrees
//0100 4 = Mirror horizontally, Rotate 180 degrees
//0101 5 = Mirror horizontally, Rotate 90 degrees CCW
//0110 6 = Rotate 90 degrees CCW
//0111 7 = Mirror horizontally, Rotate 90 degrees CW
//1000 8 = Rotate 90 degrees CW
					}
				}
			}
			v_img8I += v_img8[v_img8I] * 256 + v_img8[v_img8I + 1];//The length apparently includes length counter and FourCC
			v_jSigA = v_img8[v_img8I];
			v_jSigB = v_img8[v_img8I + 1];
			v_img8I += 2;
		}
		//alert('EXIF rot: ' + v_exifOri);



		var v_pImage2Draw = document.createElement('canvas');
		var v_pI2DCX = v_pImage2Draw.getContext('2d');
		//v_exifOri = 1;//forcing test value
		//alert('testing simulated orientation: ' + v_exifOri);
		if(v_exifOri > 4){
			v_pImage2Draw.width  = imgObj.naturalHeight;
			v_pImage2Draw.height = imgObj.naturalWidth;
		}else{
			v_pImage2Draw.width  = imgObj.naturalWidth;
			v_pImage2Draw.height = imgObj.naturalHeight;
		}
		if(v_exifOri == 2){
			v_pI2DCX.translate(v_pImage2Draw.width, 0);
			v_pI2DCX.scale(-1, 1);
		}
		if(v_exifOri == 3){
			v_pI2DCX.translate(v_pImage2Draw.width, v_pImage2Draw.height);
			v_pI2DCX.rotate(180 * Math.PI / 180);//180 degrees
		}
		if(v_exifOri == 4){
			v_pI2DCX.translate(0, v_pImage2Draw.height);
			v_pI2DCX.rotate(180 * Math.PI / 180);//180 degrees
			v_pI2DCX.scale(-1, 1);
		}
		if(v_exifOri == 5){
			v_pI2DCX.rotate(270 * Math.PI / 180);//90 degrees CCW
			v_pI2DCX.scale(-1, 1);
		}
		if(v_exifOri == 6){
			v_pI2DCX.translate(v_pImage2Draw.width, 0);
			v_pI2DCX.rotate(90 * Math.PI / 180);//90 degrees CW
		}
		if(v_exifOri == 7){
			v_pI2DCX.translate(v_pImage2Draw.width, v_pImage2Draw.height);
			v_pI2DCX.rotate(90 * Math.PI / 180);//90 degrees CW
			v_pI2DCX.scale(-1, 1);
		}
		if(v_exifOri == 8){
			v_pI2DCX.translate(0, v_pImage2Draw.height);
			v_pI2DCX.rotate(270 * Math.PI / 180);//90 degrees CCW
			//v_pI2DCX.translate(v_pImage2Draw.width, 0);
			//v_pI2DCX.rotate(90 * Math.PI / 180);//90 degrees CW
			//v_pI2DCX.scale(-1, 1);
		}
		v_pI2DCX.drawImage(imgObj, 0, 0);

		imgObj.src = v_pImage2Draw.toDataURL();//Set it to the redrawn image that is no longer upside-down, twisted or flipped due to wonky EXIF orientation.



		delete imgObj.temp_octetStream;//Release temp prop once finished.
	}//end if JPEG
};
//TODO: move .noCompresion to GraFlicArchive?? It seems that is the only thing that uses it.
GraFlicUtil.noCompression = function(fBytes, fParamZ){return fBytes;};//Do nothing with compression type 0, none.
/*
.saveToZIP()
Storing format is based on file extension, so be sure to extend json files with .json, images with .png, .jpg, etc.
JS objects will be converted to a JSON string before compressing based on '.json'.
Images may get stored with no compression because images have their own compression methods.
Uint8Arrays of raw data will be compressed as they are.
*/
GraFlicArchive.prototype.saveBLOB = function(blobMimetype, archiveFormat){
	/*
	Many filetypes are just .zip with a different extension and mimetype.
	However, if using zip mime, some systems will download the file and extract it into a folder instead of keeping it as a single archive file, which can confuse users and they would have to manually repackage it to load it and restore their project.
	blobMimetype will default to the very general 'application/octet-stream' (This will mostly be used for ZIP-based formats, but if wanting to just make a ZIP archive, GraFlicArchive can be initialized with mime 'application/zip')
	A custom mimetype string can be specified, or an object with .type set to the mimetype can be sent that will be sent to the BLOB constructor. (Type is currently the only commonly used parameter in building blobs, but that functionality is there if more are added later.)
	archiveFormat is currently unused. If more archive formats are ever supported it could accept strings like 'zip' or 'tar.gz'.
	
	Files populated by .addFile() format, an array of objects with:
	{
		"path":<string with filename>
		"data":<points to the object that will be saved as a file. such an object can be Uint8Array raw data, or a JS object that will be converted into a JSON string. This can also be set to false or omitted if it is an entry with no data like a folder.>
	}
	*/
	//the result will be saved to this.b - An ObjectURL link to the BLOB of the zip
	//TODO: include? zRes.d - The octet stream of the raw data. Maybe not because it does not need to usually be analyzed directly until loaded again via .loadFromZIP()
	
	var zipJ = this.f('z.json');
	if(zipJ && zipJ.j && zipJ.j.z_signature == 'z.json metadata'){//If has the standard z.json general file metadata, update the modified date.
		zipJ.j.modified = GraFlicUtil.getMicrosecondsTimestamp();
	}
	
	//By making a file ZIP-based, users can extract it, analyze it, edit it, replace files, and rebuild the zip to do things like replace embedded images or edit the JSON directly. Typically only advanced users would do this, but it is good to have as an option.
	//ZIP uses little-Endian for all values, unless specifically said otherwise.
	//Zip version needed is 2.0, supports DEFLATE compression and folders.
	var v_saveLen = 22;//(End of Central Directory length)
		//ZIP has no magic number properly, but will usually start with PK due to file header signature.
	var v_i;
	var v_i2;
	var v_iKey;
	//pako deflate Options
	var v_pakoDO = {
		"windowBits":15,
		"memLevel":9,
		"level":9
	};
	var v_pakoGO = {
		"gzip":true,
		"windowBits":15,
		"memLevel":9,
		"level":9
	};
	//store these in [filename, payload, compression method, original size ... ] sets, then cycle by 4s to put them into the file octet stream once the length is known and it can be built
	var v_centralDirectoryHeaders = [];//will be built based on the files and inserted at the end where they go in the ZIP file.
		//cdh array has [position of file header, cdc binary ... ] pairs. It needs to calculate the offset based on where the local file header starts.
	var v_centralDH;
	//Some files like images may use method 0 for no compression since they have their own on-board compression. (This may be used later for things like textures.)

	var v_filesToWrite = [];//filename, payload, compression method, original length sets.
	var curFile;
	var curFilePayload;
	var curFileCompression;
	var curFileUncompressedSize;//needed to save what the size was before deflating.
	var v_fileCount = 0;
	var curFilePreZipCRC;
	var f2w;
	for(v_iKey in this.files){
		console.log('[' + v_iKey + ']');
		curFile = this.files[v_iKey];
		if(curFile.temp){//Some files are temporarily used in run-time memory, but should not be saved to the archive.
			console.log('skipping temporary file: ' + curFile.p);//TODO: this temp feature might not be used anymore...
		}else if(curFile.reconst){//--------------------- if a live file that has been BLOBified for runtime ------------------
		//Extra processing will have to be done to get it back to binary archived state.
		//console.log('archiving file from reconstituted state...');
		curFilePayload = curFile.d;
		if(curFile.p.match(/\.json$/i)){
			//TODO: in some cases maybe JSON is pre-stringified and in .t instead of .j ??
			curFilePayload = GraFlicEncoder.stringToBytesUTF8(JSON.stringify(curFile.j, null, '\t'));//By default, use tab spacing to help readability.
			//Somehow previously, UTF seemed to work with just copying string to Uint8 array...?
			//But shouldn't this be a UTF-16 DOM String that needs conversion...? (It seems pako must have auto-handled the string.)
		}
		if(curFile.p.match(/\.txt$/i)){
			curFilePayload = GraFlicEncoder.stringToBytesUTF8(curFile.t);
		}
		/*if(curFile.p.match(/\.(gz|a*png|jpe*g|giff*|webp)$/i)){
			//GZip compressed files and Images have their own built-in compression, so compressing already compressed data is not efficient.
			//However, can attempt to let it compress, and use deflate if it gets smaller results.
			curFileCompression = 0;
		}*/
		if(!curFilePayload){//if .d (data) is not set, then it is an empty entry like a folder
			curFilePayload = new Uint8Array(new ArrayBuffer(0));//Make 0 length data object.
		}
		if(curFile.p.match(/\.gz$/i)){//this will apply to ALL files with .gz at the end (.dat.gz, .png.gz, .txt.gz ...)
			//ZIP compression will have been set to 0 none for having .gz at the end already,
			//now do the internal compression for the .gz
			//For some reason not getting the right magic number using gzip()
			//when the params specifically have "gzip":true it seems to work
			//maybe passing custom params to pako.gzip without "gzip":true sets GZip wrapper to false??
			curFilePayload = window.pako.gzip(curFilePayload, v_pakoGO);
			//console.log('GZ magic number: ' + curFilePayload[0].toString(16) + ' ' + curFilePayload[1].toString(16));
			//var v_unGZTest = window.pako.ungzip(curFilePayload);
		}
		//-------------------------------------------------------------
		//Apparently the CRC is based on BEFORE the file was compressed. Do this once the payload has been initialized, but before it is compressed.
		if(curFilePayload && curFilePayload.length){
			curFilePreZipCRC = GraFlicEncoder.getCRC32(curFilePayload, 0, curFilePayload.length);
		}else{//.d data might not be defined for folders with 0 bytes
			curFilePreZipCRC = 0;//leaving CRC 0 in this case seems to work.
		}
		console.log('curfilePayload: ' + (curFilePayload ? curFilePayload.length : curFilePayload) + ' CRC: ' + curFilePreZipCRC.toString(16));
		
		curFileUncompressedSize = curFilePayload.length;//save size before the Deflate.. (however, be sure to do this after logic so .gz has the correct original size, not size before internal gz compression)
		//The simplest way to pick what to compress or store is just compress it and if the compressed results are not better, just store.
		//Images ought to have their own internal compression, however if the implementation that encoded that image was inefficient or poorly optimized it may still benefit from compression. Something like inserting a large metadata entry but not compressing it could have bloated the size.
		if(curFilePayload.length){
			var compressedPayload = window.pako.deflateRaw(curFilePayload, v_pakoDO);
			if(compressedPayload.length < curFilePayload.length){
				//If compressed payload is smaller, use Deflate(8). If it does not decrease size, use Store(0)
				curFileCompression = 8;
				curFilePayload = compressedPayload;
			}else{
				curFileCompression = 0;
			}
		}else{
			curFileCompression = 0;//Empty array (such as dir), nothing to compress.
		}
		console.log('queuing file: ' + curFile.p + ' dataSize: ' + curFilePayload.length + ' compress mode: ' + curFileCompression + ' original size: ' + curFileUncompressedSize);
		f2w = {};//pre-prepare properties needed for the write operation.
		f2w.payload = curFilePayload;
		f2w.path = curFile.p;
		f2w.pathUTF8 = GraFlicEncoder.stringToBytesUTF8(curFile.p);//get UTF-8 compatible Uint8Array... (JS 16-bit string chars do not translate to UTF-8)
		f2w.compression = curFileCompression;
		f2w.uncompressed_size = curFileUncompressedSize;
		f2w.crc = curFilePreZipCRC;
		v_filesToWrite.push(f2w);
		v_fileCount++;//TODO: remove this, may be able to just use .length now that simple object array.
		}else{//---------------- end live blob --------------------------
			//If an archived file that has NOT been reconstituted, but has simply had the binary stored in .d
			//console.log('storing archived file that is not reconstituted...');
			f2w = {};
			f2w.payload = curFile.d;
			f2w.path = curFile.p;
			f2w.pathUTF8 = GraFlicEncoder.stringToBytesUTF8(curFile.p);//get UTF-8 compatible Uint8Array... (JS 16-bit string chars do not translate to UTF-8)
			f2w.compression = curFile.compression;
			f2w.uncompressed_size = curFile.uncompressed_size;//Will have been saved in this prop when the archived entry was loaded
			f2w.crc = curFile.zip_crc;
			v_filesToWrite.push(f2w);
			v_fileCount++;
		}
	}

	for(v_i = 0;v_i < v_filesToWrite.length;v_i++){//count the size of everything that was queue to be added to the file.
		v_saveLen += 76 + v_filesToWrite[v_i].pathUTF8.length * 2 + v_filesToWrite[v_i].payload.length;
			//(30) ZIP local file header value lengths, + (46) central file header
			//(filename appears in both headers, so * 2)
	}
	console.log('Allocating ZIP file size: ' + v_saveLen);
	var v_oct = new Uint8Array(new ArrayBuffer(v_saveLen));
	
	var v_pos = 0;
	var v_copyPos;//will be used to copy compressed values in the queue into the file octet stream
	
	//Calculate date/time. ZIP uses retro MS-DOS date format.
	//Will write the current date to everything for now.
	//TODO: Implement something to remember previous creation dates? It may not be applicable, this is for saving the state of runtime data components that are destroyed/rebuilt regularly.
	var jDate = new Date();
	jDate.setTime(jDate.getTime() - 18000000);//DATE time goes by -5 hours subtract that many milliseconds.
		//Still off on hours. If subtracting it goes to 12AM hours (0), if leaving as is it shows it modified tomorrow.
	//11111000 00000000 hours
	//00000111 11100000 mins
	//00000000 00011111 seconds
	var dHour = jDate.getUTCHours() << 11;
		//OLD:((jDate.getUTCHours() + 18) % 24) << 11;//5 bits (seems to be in a timezone off by 2 hours of UTC)
		//Subtract 6 hours. Add (24 -6) then mod for rollover. Regular subtraction could make invalid negative.
		//Daylight savings time may mess with it. -5 was working before, now -6 gets correct time.
	var dMin = jDate.getUTCMinutes() << 5;//6 bits
	var dSec = (jDate.getUTCSeconds() / 2);//4 bits (float will get converted to int on boolean op)
	
	//11111110 00000000 year
	//00000001 11100000 month
	//00000000 00011111 day
	var dYear = (jDate.getUTCFullYear() - 1980) << 9;
	var dMonth = (jDate.getUTCMonth() + 1) << 5;
	var dCalDay = jDate.getUTCDate();
	
	var packedTime = dSec | dMin | dHour;
	var packedDate = dCalDay | dMonth | dYear;

	var localHeaderPos;
	
	for(v_i = 0;v_i < v_filesToWrite.length;v_i++){
		//[filename, payload, compression, original size, central directory header ... ] method sets.
		//Central directory will be null initially. It will be constructed here, since most of the values are the same as local file header, it is easy to copy. 
		var v_filenameBytesUTF8 = v_filesToWrite[v_i].pathUTF8;//was set to AE.stringToBytesUTF8
		var v_filenameSize = v_filenameBytesUTF8.length;
		//The ZIP spec does not officially support UTF-8 with a bit flag until a later version than the ubiquitous 2.0, but since UTF-8 is backwards compatible with ASCII, and codepage-based encodings have long been out of favor, it seems systems may be defaulting to interpreting it as UTF-8 anyways. So support UTF-8 anyways.
		var v_payload2Copy = v_filesToWrite[v_i].payload;
		var v_payloadSize = v_payload2Copy.length;
		var v_fileCRC = v_filesToWrite[v_i].crc;
		//cdh array has [position of file header, cdc binary ... ] pairs. It needs to calculate the offset based on where the local file header starts.
		localHeaderPos = v_pos;
		//local file header signature
		GraFlicEncoder.writeUint32(v_oct, 0x04034B50, v_pos, true);
		v_pos += 4;
		var v_copyPosCDH = v_pos;//copy everything from here into the central directory header where it also appears.
		//2.0, version needed to extract.
		v_oct[v_pos] = 20;//Lower byte(little-Endian), version code * 10
		v_oct[v_pos + 1] = 0;//Upper byte OS. Seems to often be zero regardless of what OS made by is.
			//(It is unclear what to do with this upper byte. Specifying an OS dependency for file attributes seems counter-productive. Some writes set this to the DOS code 0, that might be what to do.)
		v_pos += 2;
		//general purpose bit flag
		//|    bit 0   | bits 1 & 2      | bit 3                      | bit 4    | bit 5   | bit 6      | bit 7 - 10 |
		//| encryption | compression     | use data descriptor        | reserved | patched | strong     |  unused /  |
		//|  always 0  | speed / c level | after l file header        |          |  data   | encryption |  reserved  |
		//|            | 1 0 since using | zero out CRC and size here |          |         |            |            |
		//|      0     | param 9 best    |             0              |    0     |    0    |     0      |      0     |

		//| bit 11                                        | bit 12   | bit 13    | bit 14 - 15 |
		//| Use UTF-8                                     | reserved | encrypt   | reserved    |
		//| Turn this on. Filenames will either be ASCII, |          | central   |             |
		//| with is backwards compat with UTF-8, or UTF-8 |          | directory |             |
		//| do not need to support old codepage systems.  |          |           |             |
		//|        1 (or 0 since using ZIP 2.0)           |     0    |     0     |      0      |
		//It looks like some of these are not defined as of ZIP 2.0, only the first 3 bits are, so leave others as 0.
		//Apparently bits are in REVERSE ORDER, so this should be 0x0002, not 0x4000.
		GraFlicEncoder.writeUint16(v_oct, 0x0002, v_pos, true);
		v_pos += 2;
		//Note: Do bits 1 and 2 need to be zeroed if uncompressed? Spec says it is undefined in that case so it seems it shouldn't matter...
		
		//compression method
		GraFlicEncoder.writeUint16(v_oct, v_filesToWrite[v_i].compression, v_pos, true);
		v_pos += 2;
		//MS-DOS format date and time.
		GraFlicEncoder.writeUint16(v_oct, packedTime, v_pos, true);
		v_pos += 2;
		GraFlicEncoder.writeUint16(v_oct, packedDate, v_pos, true);
		v_pos += 2;
		//CRC32 (Assuming CRC of the compressed or plain file itself.)
		GraFlicEncoder.writeUint32(v_oct, v_fileCRC, v_pos, true);
		v_pos += 4;
		//compressed size
		GraFlicEncoder.writeUint32(v_oct, v_payloadSize, v_pos, true);
		v_pos += 4;
		
		//uncompressed size
		GraFlicEncoder.writeUint32(v_oct, v_filesToWrite[v_i].uncompressed_size, v_pos, true);
		v_pos += 4;
		
		//filename length
		GraFlicEncoder.writeUint16(v_oct, v_filenameSize, v_pos, true);
		v_pos += 2;
		
		//extra field length. 0, does not use extra field.
		GraFlicEncoder.writeUint16(v_oct, 0, v_pos, true);
		v_pos += 2;
		GraFlicEncoder.writeUbytes(v_oct, v_filenameBytesUTF8, v_pos);
		v_pos += v_filenameBytesUTF8.length;
		//========== Build the central directory header to be inserted in the list at the end of the file. =============
		v_centralDH = new Uint8Array(new ArrayBuffer(46 + v_filenameSize));
		//central directory has 16 additional bytes that the local file header does not, and of course the 4 byte signature is different
		for(v_i2 = 0;v_i2 < 26;v_i2++){
			//start copying to CDH after signature(4) and version made by(2)
			v_centralDH[6 + v_i2] = v_oct[v_copyPosCDH + v_i2];
		}
		v_centralDirectoryHeaders.push(v_centralDH);
		
		GraFlicEncoder.writeUint32(v_centralDH, 0x02014B50, 0, true);//signature
		
		v_centralDH[4] = 20;//Version made by * 10
		v_centralDH[5] = 0;//MS-DOS FAT seems to be the most widely supported in ZIP handlers, so use that.
		//OS code 3 *NIX is the code for *nix (Most general OS code, this is JS-based and the actual operating system cannot be reliably detected.)
		//*NIX has the OS-specific attributes, and the 'default' MS-DOS attributes on the lowest 6 bits (PKZIP was originally a DOS program), so that has the most options.
		//*NIX permissions are not that useful without being able to restore the user id and group id. Unless it is a closed network, other computers out there will have different user and group IDs and there would be no way to reliable know what to set them to. Code 3 use case would mostly be backing up server files or things like that.
		//Some of the other host OSes in the list may be historical/obscure, and not interoperable with many ZIP packagers/readers out there.
		//TODO: Consider adding a configureable host OS option??? The platform-dependent attributes seem to have interoperability issues on other types of systems and it may not be good to rely on them.
		//... copied from local file header ...
		GraFlicEncoder.writeUint16(v_centralDH, 0, 30, true);//extra field length (do not use either of these extra/comment)
		GraFlicEncoder.writeUint16(v_centralDH, 0, 32, true);//comment length
		GraFlicEncoder.writeUint16(v_centralDH, 0x0000, 34, true);//disk number
		var iAttr = 0x0000;
		if(v_filesToWrite[v_i].path.match(/\.(txt|json|css|csv)$/i)){
			iAttr |= 0x0001;
		}
		GraFlicEncoder.writeUint16(v_centralDH, iAttr, 36, true);//internal file attributes
			//internal attributes: bit0(0x1) - Treated as ASCII/text rather than binary,
				//bit1(0x2) - indicates record controlling to support data transfer with mainframes (usually N/A)
				//Bits 2-16 are apparently unused, at least in ZIP 2.0
		//It seems FAT attributes are sometimes ignored in *NIX mode by some things.
		var fAttr = 0x00000000;
		if(v_filenameBytesUTF8[v_filenameSize - 1] == 0x2F){//Ends in /, isDirectory
			//fAttr |= 0x40000010;//Set *NIX type and FAT Dir flag. <-- alternate way for code 3
			//fAttr |= 0o0755 << 16;
			fAttr |= 0x00000010;//Set FAT Dir flag.
		}else{
			//fAttr |= 0x80000000;//Regular file. <--- way for code 3
			//fAttr |= 0o0644 << 16;
			fAttr |= 0x00000020;//Setting A for non-dirs seems to be the convention.
		}
		//fAttr |= 0x00000002;//Test FAT Hidden (Does not seem to do anything on *NIX, maybe would work if .hidden or extended attribute were implemented on the system extracted to.)
		//fAttr |= 0x00000001;//Test FAT Read-Only, seems to be interpreted in *NIX as r--r--r--(444/files) r-xr-x-r-x(555/dirs)
							//Default on FAT seems to interpret to rw-r--r--(644/files) rwxr-x-r-x(755/dirs)
		//fAttr |= 0o7777 << 16;//Test setting all *NIX permissions on.
		//Still write in little Endian, even though not a number...
		GraFlicEncoder.writeUint32(v_centralDH, fAttr, 38, true);//external file attributes
			//The high byte bits 1-7 seem to be always MS-DOS FAT attributes:
			//(Read-Only[0](0x1) / Hidden[1](0x2) / System[2] / Volume[3] / Directory[4](0x10) / Archive[5](0x20)) [6] may mean device in some later DOS versions. [7] is reserved, leave as 0.
					//Archive bit means 'has not been backed up' when set???
			//The other 3 bytes, if a host-OS other than MS-DOS, may contain other OS-specific attributes.
			//For host 3, *NIX, the lowest 2 bytes store permissions, while the byte in the middle seems to be unused (Though somewhere it is mentioned in may have added extra things to put there, maybe user/group IDs??)
			// use 0 prefix when setting for octal like 0o0644
			//terminal special display --> (s)  (s)  (t)
			//*NIX FS octals: [tttt][ugs][rwx][rwx][rwx] (<< 16 shift to get them in the high bytes)
			//        type(4)--^     ^--special(3): set user id, set group id, sticky
			//           Lower bytes always MS-DOS FAT: 00000000 00ADVSHR (only 6 bits seem to be used)
			//some packagers seem to set this, unknown?--^
			//For type, 1000(0o10) is regular file, 0100 is directory (0o04)
				//0o01 named, 0o02 char/special, 0o06 block, 0o12 symbol, 0o14 socket
		GraFlicEncoder.writeUint32(v_centralDH, localHeaderPos, 42, true);//Start of local header from beginning of file, only ZIP64 uses relative offset to local file header (could be filled in when the position it is offsetting from is known in that case.)
		//Central directory header has filename too.
		GraFlicEncoder.writeUbytes(v_centralDH, v_filenameBytesUTF8, 46);
		/*for(v_i2 = 0;v_i2 < v_filenameSize;v_i2++){
			v_centralDH[46 + v_i2] = v_filenameBytesUTF8[v_i2];//escapes previously parsed to bytes
		}*/
		
		//--------------------------------------------------
		
		//copy payload to the ZIP file
		GraFlicEncoder.writeUbytes(v_oct, v_payload2Copy, v_pos);
		v_pos += v_payloadSize;
		/*for(v_i2 = 0;v_i2 < v_payloadSize;v_i2++){
			v_oct[v_pos] = v_payload2Copy[v_i2];
			v_pos++;
		}*/
	}//end for
	//The central directories have been previously built. now copy them to the central directory at the end.
	var v_startCD = v_pos;//used to calculate central directory size and offset.
	for(v_i = 0;v_i < v_centralDirectoryHeaders.length;v_i++){//(stored in CD header, localHeaderPos pairs)
		v_centralDH = v_centralDirectoryHeaders[v_i];
		//var v_correspondingFileHeaderPos = v_centralDirectoryHeaders[v_i];//OLD, Incorrect way.
		//(The offset can be pre-written in the pre-prepared header array because it is just offset from the start of the file.)
		//GraFlicEncoder.writeUint32(v_centralDH, v_correspondingFileHeaderPos, 42, true);//relative offset to local file header
		//Simply write the position from the start of the file thismode is the only mode that seems to be supported across all extractors.
		//It looks like relative offset from CentDirHeader is for ZIP64, not ZIP 2.0: (v_pos - v_correspondingFileHeaderPos) ( BREAKS on many extractors but works on some.)
		for(v_i2 = 0;v_i2 < v_centralDH.length;v_i2++){
			v_oct[v_pos] = v_centralDH[v_i2];
			v_pos++;
		}
	}
	//============ Write end of directory header. ===================
	var v_sizeCD = v_pos - v_startCD;//assuming size of central directory does not include this end of directory header...
	GraFlicEncoder.writeUint32(v_oct, 0x06054B50, v_pos, true);
	v_pos += 4;
	GraFlicEncoder.writeUint16(v_oct, 0, v_pos, true);//Current disk number
	v_pos += 2;
	GraFlicEncoder.writeUint16(v_oct, 0, v_pos, true);//Disk where central directory starts
	v_pos += 2;
	GraFlicEncoder.writeUint16(v_oct, v_fileCount, v_pos, true);//Central Directory records count on current disk
	v_pos += 2;
	GraFlicEncoder.writeUint16(v_oct, v_fileCount, v_pos, true);//Central Directory record count
	v_pos += 2;
	GraFlicEncoder.writeUint32(v_oct, v_sizeCD, v_pos, true);//Central Directory size
	v_pos += 4;
	GraFlicEncoder.writeUint32(v_oct, v_startCD, v_pos, true);//Central Directory position, bytes away from the start of the zip
	v_pos += 4;
	GraFlicEncoder.writeUint16(v_oct, 0, v_pos, true);//Comment Size
	v_pos += 2;
//Comment (Not written, comment length set to 0.)
	//-----------------------------------------
	
	var blobParams = {'type':'application/octet-stream'};//params for createObjectURL
	var arcJ = this.f('z.json').j;
	if(arcJ && arcJ.mime && (typeof arcJ.mime) === 'string'){//z.json will usually be present and may have had a mime type configured there.
		blobParams.type = arcJ.mime;
	}
	//To override assigned mime type in z.json, call with the mime param. Sometimes building blob with a more general mime type like application/zip increases chances of it being accepted by other apps and such that only accept certain files.
	if(blobMimetype){
		if( (typeof blobMimetype) === 'string'){
			blobParams.type = blobMimetype;
		}else if( (typeof blobMimetype) === 'object'){
			blobParams = blobMimetype;
		}
	}
	this.b = URL.createObjectURL( new Blob([v_oct], blobParams) );
	var blobRes = {};//Return an Object that contains the (o)ctet stream, the (b)lob link, and (m)ime type.
	blobRes.b = this.b;
	blobRes.o = v_oct;
	blobRes.m = blobParams.type;//mime type
	return blobRes;
};//end GraFlicArchive.saveBLOB()
GraFlicArchive.archives = [];//A list of archives that have been loaded into memory. Useful for getting a file from any archive that has the path to it.
GraFlicArchive.getFileFromAny = function(fPath){
	//Static function. Will get the file at the path given if it exists in any archives that have been created, or return false if missing.
	//If there is a file with the same path in multiple archives, access it directly from he archive it is in.
	var curArchive;
	for(var i = 0;i < GraFlicArchive.archives.length;i++){
		curArchive = GraFlicArchive.archives[i];
		if(curArchive.files[fPath]){
			return curArchive.files[fPath];
		}
	}
	return false;
};
GraFlicArchive.prototype.f = function(p){
	//Get the file that is located at the path.
	//This will check if this has been reconstituted yet. If not, it will make it into a 'live' file before returning the file object.
	//This approach avoids allocating extra resources to make runtime objects for things that are never accessed.
	//It also helps reduce the change of problems with junk files created by some ZIP packaging programs or systems. Some of these have files with incorrect extensions such as .png or .jpg but are not that type and have junk data, causing problems if it is attempted to be runtimeified. This way those files typically will not be accessed because files are only reconstituted as needed when specifically asked for with archive.f('file.png').
	//TODO: Could save a last-accessed property with the file, and if it is not access for a long time it could be auto-archived. However there would need to be a way to make sure there are no image.src or anything linking to the BLOB url.
	//TODO: Could have files data into the browser DB then release the resources. Once the file is requested with f() it could be pulled out of the DB. This may help with releasing RAM for unused things if an extremely large archive is loaded. Kind of ugly and probably not worth doing for now, but in the future possibly. Would also need to make sure the temp DB gets cleared and does not just sit there hogging space afterwards.
	var f = this.files[p];
	if(!f){
		//Do not console this unless specifically debugging for it, systems that cascade archives may have lots of return false lookups and flood the console.
		//console.log('could not load file: ' + p);
		return false;
	}
	this.reconstituteFile(f);//Make things live in the file. (or just return the file object if that has already been done)
	return f;
};
GraFlicArchive.prototype.reconstituteFile = function(f){
	//Makes the properties in the file object live for runtime use (.b BLOB, .i image, etc) rather than just raw binary archive.
	
	if(f.reconst){return;}//Has previously been reconstituted, no more processing needed.
	
	var v_decompressor = GraFlicUtil.noCompression;//default to 0, no compression
	console.log('reconstituting, compression mode: ' + f.compression);
	if(f.compression == 8){//DEFLATE
		v_decompressor = window.pako.inflateRaw;
	}
	try{//-----------------------------------------------------------------------------------
		if(f.p.match(/\.gz$/i)){
			//If .gz first decompress it with whatever compression method is defined in the ZIP entry (usually 0 none),
			//then set the decompressor to ungzip because .gz has internal compression of its own.
			f.d = v_decompressor(f.d);
			v_decompressor = window.pako.ungzip;
			console.log('.gz file, setting decompression to GZip, gz payload size: ' + f.d.length);
		}
		//JSON and text will not have .d (data) populated since it is pretty useless in most cases and would waste resources.
		if(f.p.match(/\.json(\.gz)?$/i)){
			//JSON needs extra logic to JSONize it into memory.
			f.j = JSON.parse(v_decompressor(f.d, {'to':'string'}));
			//alert('extracted JSON(' + f.p + '): ' + JSON.stringify(f));
			/*this.j[f.p.replace(/\.json(\.gz)?$/i, '')] = f.j;//Set up a quick link for accessing JSON.
						//JSON files will typically contain the main configuration, parameters, and settings of a format
						//and need to be accessed often so .j.config.valX is less cluttered than: .f('config.json').valX
						//do this after the file was successfully extracted
			(this archive.j.x feature was removed, if there is a key JSON file that must be accessed allot, simply set a var = archive.f('x.json').j; for quick access)*/
		}else if(f.p.match(/\.txt(\.gz)?$/i)){
			f.t = v_decompressor(f.d, {'to':'string'});
		}else{
			f.d = v_decompressor(f.d);
			//Some browser may truncate the array text when tracing to debug and look like all zeroes.
			console.log('extracted U8Array(' + f.p + '): ' + f + ' size: ' + f.d.length);
		}
	}catch(fileError){
		console.log('error reconstituting ' + f.p + ', it may be a junk or auto-generated file.');
	}//-------------------------------- end try/catch ----------------------------------------
	
			//else if(v_filename.match(/\.(a*png|jpe*g|giff*|webp)(\.gz)?$/i)){
			//}
				//Keep image Uint8Array linked in case it needs to be examined for metadata such as EXIF rotation.
				//Also make a loadable BLOB ObjectURL so it can easily be loaded into images in the DOM.
				//Since the Uint8Array is used to build the BLOB for the ObjectURL, it would seem that dereferencing
				//it would probably not save any runtime resources, may as well keep it alive for analysis if needed.
			//make BLOBs for all files too
			//f.d = v_decompressor(f.d);
	this.fileToLiveBLOB(f);

	f.compression = 0;//Set to 0 now that it has been reconstituted to non-archived, non-compressed form
	f.reconst = true;//Mark the file as being reconstituted already
	return;
};
GraFlicArchive.prototype.revokeAll = function(){
	//This will remove the BLOB ObjectURL so that it frees memory and data used to build them can be garbage collected if dereferenced.
	//Once all BLOBs are revoked all that should be needed to garbage collect the files is to dereference the GraFlicArchive object.
	this.revokeFiles();
	this.revokeArchiveFile();
};
GraFlicArchive.prototype.revokeFiles = function(){
	var v_file;
	for(var v_iKey in this.files){
		v_file = this.files[v_iKey];
		if(v_file.b){URL.revokeObjectURL(v_file.b);}
	}
};
GraFlicArchive.prototype.revokeArchiveFile = function(){
	if(this.b){//Clear previous save to stop memory leak.
		URL.revokeObjectURL(this.b);
	}
};
GraFlicArchive.prototype.addMetaZIP = function(){
	//If more vast params added, could check to see if first param is an object and use the properties of that and ignore other params, to make more flexible.
	/*
	Will use the file 'z.json'. ZIP is synonymous with archive, so it is broad enough to encompass other archive formats if more are supported in the future. However, ZIP 2.0 is the ubiquitous standard for archive-based file formats, so the focus will be on ZIP. Also, needs to support ZIP specific issue ZIP Epoch. Even though newer archive formats , for an archive-based file format it is of less importance. Allot of the files being packed into the archive like images have their own internal compression anyways.
	The z.json meta file may not make sense to use if building something like a tar.gz file. Tape Archives have the use case of preserving *NIX-specific file properties like executable, and options like absolute paths. TAR is useful to do things like build a tarball to send to a server and extract to configure a website for example. .tar.gz may not make sense for archive-based formats but would be useful for website editors or things like that. Note that ZIP supports some *NIX permissions when using host OS code 3.
	
	Creates an z.json file at the root of the archive file and returns the file object so that any needed modifications can be made.
	Currently it is only being used for ZIP-based files, but it is general enough to be interoperable with other archive types like TAR. TAR might theoretically have other considerations for where z.json is located dealing with absolute paths and such.
	'z.json' is used because it is short and tells that it is in standard JSON format. (file headers and central directory with file paths are uncompressed in ZIP) zip.json or zip_file.json could be used as alternates if a file has a z.json that does something else.
	The focus of this spec is to give details about the file and how to open it or what to do with it. There are many ZIP-based/Archive-based formats and systems may not have software already installed to deal with them. It does not need to give an in-depth description of the file contents, the file design itself ought to do that it its own metadata if needed.
	It contains properties that can be used to find/verify the type of file and in some cases, resolve conflicts with similar files.

------- z.json 1.0 (draft April 8th, 2018) 80-width/terminal-compatible -------

z.json is a simple, easy to ready, JSON file that describes properties general
enough to apply to any file, or any file of a broad type media such as images.
The JSON format makes it easy to use in javascript-based apps via JSON.parse().
A growing number of powerful javascript/HTML5 web-apps are now emerging.
JSON is also widely supported on other platforms and easily human-readable if
viewed as plain text.

This project is proposing z.json as a standard for simple, easy to work with
general metadata for archive-based formats that provides file type resolution,
archive root resolution, and in some cases, conflicting file resolution. Root
resolution helps handle archive-based files that have been unpacked, manually
edited, and repackaged, possibly causing the contents to be nested in extra
folders. See below for more information on that.

 * Note that this is not currently backed by
   any mainstream standards organization.

This open source project seeks to make these useful features available to all
developers and sees it as a potential standard for making ZIP-based or
archive-based files easier to work with for apps, web-apps and type-agnostic
use cases like file browsers or file information utilities.

This lightweight design makes it easy for developers to make software
interoperable with the JSON-based metadata rather than having to add huge
overhead or a sprawling patchwork of dependencies to their code to read and
write to a highly complicated structure.
Overly complicated structures are like using a space-age cybernetic robot arm
as a eating utensil instead of just using fork.

Magic numbers are not an option for ZIP-based files. You could put a specific
file with a specific name at the start of the ZIP to act as a Magic Number, but
if the archive gets unpackaged, edited, and packaged with other archiving
software, it will put the files in any order it chooses, so that would be
unreliable and subject to being altered. Using a ZIP extra field as a magic
number would be even more unreliable because they will almost certainly be lost
if the archive is unpackaged onto a filesystem. Many ZIP archivers support few,
if any, extra fields.

Root resolution will fix a common packaging mistake by looking for the z.json
root location.
Due to the wonky, unintuitive way that packaging is typically handled, users
will often right-click the folder and archive the folder rather than select and
archive folder contents, resulting in files being buried in a redundant folder.
If they select the files and do it the right way, then the archive will be
built correctly, but can end up in the same folder as the contained files on
the filesystem, which is also awkward...

The .id property in combination with the .created timestamp property can be
used in the case of a collision to resolve a conflict between files with the
same or similar name or id.

Any non-general app-specific or vendor-specific metadata ought to be stored by
the app elsewhere, probably in another JSON file. There is not much that can be
ascertained from such properties unless the reader is specifically designed
with knowledge of a specific type of file format.

This is primarily designed for formats that are based on ZIP or other Archive
formats, but it could be inserted into other types of files IF REALLY NEEDED.
For example a custom sub-chunk wrapped within the "INFO" chunk in RIFF-based
formats.
A 4-byte ASCII code for RIFF should be: "ZJSN"
A variable-length string identifier or chunk tag should be: "z.json"
(For example writing it as an "iTXt" PNG chunk.)

Usually, the standard PNG "tEXt" chunks are enough to handle what is actually
needed in a final PNG file.
For RIFF-based formats such as WebP, metadata needs can in most cases be met
with standard "INFO" sub-chunks such as: "ICMT" (Comment), "IART" (Artist),
"ISFT" (Software created by), "ICOP" (Copyright), "IDPI" (DPI), "INAM" (Title),
and others.

All properties are optional except: .z_signature
Always do a simple is-defined test to see if the property is defined, or do a
for-in loop to process the properties when reading programatically.

.z_signature    - (required) always equal to "z.json metadata"
This is a longish strong signature to prevent collision if other files happen
to be named 'z.json' in other archives for other purposes.

.z_version      - The version of the z.json spec (will be higher than 1.0 if
more features are added later.) This is a float, though JSON serializers will
strip off .0 if nothing after decimal point.
The version is just a hint. Always do is-defined checking and look for desired
properties.

.mime           - The MIME type that should be associated with this file.

.type           - The file extension that should be associated with this file.
(Sometimes files get renamed/repackaged to .zip or the extension gets deleted
or changed otherwise.)

.file           - The full original name of the file including extension of
the ZIP-based file. The filename may be lost if the file contents are sent
through a stream without metadata, or may be renamed by a user orprogram. The
separate extension property unambiguously clarifies what the extension is.
Remember that some files have multiple dots or even omit the extension.

.apps           - An array of objects with info about supporting apps, in order
of priority. Recommended for non-mainstream types.

.zipoch         - ZIP Epoch, an integer that can help extend the range of the
MS-DOS date time format which cannot go past 2107. ZIP files have an epoch of
1980 and only a 0-127 year range in the date-time format used in ZIP file
entries. If it is not past 2107 yet, this should probably be left undefined.
If defined, the ZIP-stored date time will be interpreted differently by
supporting unpackagers. In that case the date time year value will be
interpreted as 'years since [.zipoch integer value]'.
Note that ZIP MS-DOS date times are based on UTC - 5. (U.S. Eastern Time)
BC time could be represented with a negative number. This would be useful
if archaeologists uncover pre-historic computers with files on them and those
files are added to an archive. This is for the times stored in the ZIP file
headers, not those in this JSON file.

Note that for this to work with no loss of date-time information, all files
stored in the ZIP archive must have all date-times that are within a 128 year
span.

Timestamps in z.json may be based on milliseconds since *NIX epoch
(Midnight January 1st, 1970). There may be thousandths of a millisecond
precision after the decimal point.(microseconds)
JSON does not limit integer size, but readers may have their limits.

.created        - The date that the ZIP-based file was created. When
unpacking and repacking together a ZIP after modifying the contained files, the
creation date in the filesystem of the new .zip may be set to when it was
repackaged, not when the original file was actually created.

The .created property can be used in some cases to resolve conflicts with
similar files that have the same internal IDs. If one file is associated with
another based on an internal ID, and multiple files are located with the same
ID, it the file also has the created timestamp to go with the ID for the file
it is associated with, it can compare the ID and the timestamp to find the most
likely match. For example, the Deckromancy program uses this system to locate
the card maker environment that a .card was created with and load it to be able
to reconstruct the card.

.modified       - The date that the ZIP-based file was modified.
Unlike .created, when a ZIP is repackaged the modified is usually updated by
whatever software packages it. However, when uploaded to a website or such, the
receiving site may or may not set the modified date correctly. Note that when
manually packaging a ZIP based file this will not get updated unless the user
updates it manually. Can be used if file received as an octet-stream with no
filesystem info like timestamps.


.locale         - A BCP47 string such as "ja-JP". Tells what locale
language-sensitive strings on the root of the object should be treated as.

.locales        - An associative object that can add locale-specific overrides
to properties (mostly used for .app suggest app name/type of app description
phrase) Use pattern this to localize things:
"locales":{"de-DE":{"apps": [{"title":"Deutsch String"}]}}

.thumbs         - An array of thumbs in this format:
[{"file":"thumb_name.png", "width":100, "height":100}]
Allows type-agnostic access to thumbnail images in the archive. A file browser
or similar thing may use this to display a preview. The .file property within
points to the location within the ZIP/archive.

.images         - An array of large images if the document can be rasterized.
The structure is the same as .thumbs. The difference is that .images is for
files that can be rasterized and store large resolution images internally,
rather than just some tiny images for previews. Some files might store just one
full image. Others might store different images at different resolutions.

.prefaces       - An array of objects with strings to use for a text-based
preview in non-graphical files.
They are wrapped in an object to stay extensible.
A file browser can select a preface of appropriate size by examining the
.text.length property. The format is:
[
 {"text":"This is a tiny preface."},
 {"text":"This is a medium preface with more stuff!"}
] 
      * If there are localized thumbs, images, or prefaces, put them within
        locale structure such as: "locales":{"es-MX":{"thumbs":[ ... ]}}

.width,        - Numbers representing the width and height in pixels.
.height        

.ppm,          - Pixels per meter. A number that can be used with width and
height to describe the physical size of a file such as an image.
Note that an inch is 0.0254 meters if wanting to convert PPI.

.title         - A non-verbose string briefly describing the file.
This is not the file name in file systems. Feel free to use spaces, symbols and
characters that are avoided in file names.

.author        - A string containing the author of the file.

.copyright     - A string to put copyright notices in.

.warning       - A string with warnings such as sensitive content.

.disclaimer    - A string with legal disclaimer text.

.comment       - A miscellaneous comment string.

.software      - The software that created this file.

.duration      - The numeric duration in milliseconds for files such as videos
or animation that have a simple duration of play.

.website       - String contains a link to a website. http:// or https:// are
not needed. Since this is a website specifically, those protocols can be
assumed and both can be attempted.

.id            - A string that is an identifier representing the file.
Some files may reference other files that they need to retrieve information or
assets from.
Some formats might uses number based IDs, but in that case those are often so
large that they would surpass the capacity that JSON readers would likely have
for the foreseeable future and ought to be converted to a string.
If it is a string representation of a number, it should be a normal base 10
number string, allowing the most basic 'parseInt' logic possible to work on it.

.version_needed - A numeric value representing the version of the associated
software needed to open this file. It can be an integer or a float depending on
how the associated software formats the version number. Some software might
present a string as the version like "beta 0.8.2c", but usually has a number
internally representing the version, as is the best practice.
Doing a version >= version_needed comparison is easier and more reliable with
numeric values.

.version_used  - The same as version_needed, except this represent the version
of the associated software that was used to create this file.

.edit          - An integer representing the number of times this incarnation
of the file has been edited.

.internal_metadata - A string linking to a file within the ZIP file or archive
that contains internal metadata specific to the format, which is not general
enough to be included in z.json. Example: "internal_folder/m.json"






*******************
		(note that defining a .accessed does not make sense. Files do not usually get written to when they are accessed, just when they are created or modified. An accessed property would not be reliable.)
		Defining other attributes like owner and permissions does not currently seem to make sense either, since it will not change the actual permissions of the ZIP-based file and who can do what with it.

***experimental***
.protocols            - (optional, undecided on and experimental, may be moved to within .apps which can represent specific apps or generic app types) Ana array of protocol string teplates that can be used to build a URL to attempt to launch in a supporting app that is registered to handle the protocol, in order of priority.
	Include a string with the 'protocol_string' and %p for where the path to the file goes, and anything else that might be needed in the protocol URL. Example: 'protocol_string:%p' or 'protocol_string://%p&param=x'. (use p for path to file, a-f are valid %AF hex escapes in a URL)
A website could use this to generate protocol links for files that should launch in specific programs
*******************

	*/
	
	//The default, ZIP, is ubiquitous enough that it should be handleable with just the mime and extension, so leave .apps undefined if no specific info sent.
	//The following is an example of an app entry:
	/*if(!apps){
		apps = [
			{
				"title": ".ZIP Archive Software",
				"scheme": "archive"
			}
		];
	}
	Only .title is decided on, a string description of the suggested software to open this file. The strings can be the name of a specific program or a general description like "Animated PNG Image Editor". This could be used to launch a search request for the string if the software is not installed or cannot be located.
	*/
	var aFile = {};
	aFile.p = 'z.json';//z.json is always put at the root of the archive and can be read to confirm the content type.
	aFile.j = {};
	aFile.j.z_signature = 'z.json metadata';
	aFile.j.z_version = 1.0;
	aFile.j.mime = 'application/octet-stream';
	aFile.j.type = 'zip';
	aFile.j.zipoch = 1980;//optional, not really needed until 2107 (there is a 0x5455 extra field out there that adds 'extended timestamps' but it still has the 2107 limitation, only adds created/accessed in addition to modified. It would not be reliable to assume other packagers would retain extra fields anyways.)
	var timeNow = GraFlicUtil.getMicrosecondsTimestamp();//Get time in microseconds.
	aFile.j.created = timeNow;
	aFile.j.modified = timeNow;
	//aFile.j.locale = 'en';
	this.addFile(aFile);
	return aFile;
	//While z.json would be at the root, an optional filetypes/ could contain things like filetypes/fext.json with the file json properties for the extension. This will help identify how to deal with uncommon file types contained within the archive. If z.json or filetypes/ is used for something else, then prefix to 0z and increment(...3z) until a name that is not taken is found.
};

//-----------------------------------------------------------
GraFlicUtil.getMicrosecondsTimestamp = function(){
	if(window.performance && window.performance.timing && window.performance.timing.navigationStart && window.performance.now){
		return  window.performance.now() + window.performance.timing.navigationStart;
	}
	return Date.now();
};
GraFlicUtil.RGB2HSL = function(v_srcR,v_srcG,v_srcB){
 var v_destH;var v_destS;var v_destL;
 //v_srcR/=255;v_srcG/=255;v_srcB/=255;//keep the main RGB selected a float. 48 bit color could someday be supported and 0-255 int would cause problems with that.
 var v_maxRGB = Math.max(v_srcR,v_srcG,v_srcB);
 var v_minRGB = Math.min(v_srcR,v_srcG,v_srcB);
 v_destH = (v_maxRGB+v_minRGB)/2;
 v_destS = v_destH;v_destL = v_destH;
 if(v_maxRGB == v_minRGB){
  v_destH = 0;//Not chromatic, grayscale. No Hue or saturation.
  v_destS = 0;
 }else{
  var v_mmDiff = v_maxRGB - v_minRGB;
  if(v_destL > 0.5){
   v_destS = v_mmDiff / (2 - v_maxRGB - v_minRGB);
  }else{
   v_destS = v_mmDiff / (v_maxRGB + v_minRGB);
  }
  switch(v_maxRGB){
   case v_srcR:
    v_destH = (v_srcG - v_srcB) / v_mmDiff;// + ( v_srcG < v_srcB ? 6 : 0 ); //some formula show this some don't (?6:0)
    break;
   case v_srcG:
    v_destH = (v_srcB - v_srcR) / v_mmDiff + 2;
    break;
   case v_srcB:
    v_destH = (v_srcR - v_srcG) / v_mmDiff + 4;
    break;
  }
  v_destH /= 6;//taking it times 60 would give degrees in the HSL cylinder. divide by 6 makes it 0.0-1.0
 }//end is chromatic
 return [v_destH,v_destS,v_destL];
};
GraFlicUtil.HSL2RGB = function(v_srcH,v_srcS,v_srcL){
  //HSL are 0-1, RGB are 0-255
  var v_destR;var v_destG;var v_destB;
  if(v_srcS == 0){//no saturation, achromatic, use a grayscale
   v_destR = v_srcL;v_destG = v_srcL;v_destB = v_srcL;
  }else{
   var v_zA;
   if(v_srcL < 0.5){
    v_zA = v_srcL * (1 + v_srcS);
   }else{
    v_zA = v_srcL + v_srcS - v_srcL * v_srcS;
   }
   var v_zB = 2 * v_srcL - v_zA;
   v_destR = GraFlicUtil.hue2ChannelPercent(v_zA,v_zB,v_srcH+1/3);
   v_destG = GraFlicUtil.hue2ChannelPercent(v_zA,v_zB,v_srcH);
   v_destB = GraFlicUtil.hue2ChannelPercent(v_zA,v_zB,v_srcH-1/3);
  }//end chromatic
  //this algorithm is coming back with inverted results, so inverting it here to get it to normal.
  //return [Math.round(v_destR*255),Math.round(v_destG*255),Math.round(v_destB*255)];//OLD way
  return [v_destR, v_destG, v_destB];
};
GraFlicUtil.hue2ChannelPercent = function(v_srcZA,v_srcZB,v_srcHue){
 if(v_srcHue < 0){v_srcHue += 1;}
 if(v_srcHue > 1){v_srcHue -= 1;}
 if(v_srcHue < 1/6){return v_srcZB + (v_srcZA - v_srcZB) * 6 * v_srcHue;}
 if(v_srcHue < 1/2){return v_srcZA;}
 if(v_srcHue < 2/3){return v_srcZB + (v_srcZA - v_srcZB) * (2/3 - v_srcHue) *6 ;}
 return v_srcZB;
};
GraFlicUtil.RGB2HSV = function(r, g, b){
	var h, s, v;
	var n = Math.min(r, g, b);
	var x = Math.max(r, g, b);
	v = x;
	var d = x - n;
	if(d <= 0.00001){
		//Grayscale
		return [0, 0, v];
	}
	if(x > 0){//avoid zero-division
		s = d / x;
	}else{//No channel above zero, absolute black
		return [0, 0, 0];
	}
	if(r == x){
		h = (g - b) / d;
	}else if(g == x){
		h = 2 + (b - r) / d;
	}else{
		h = 4 + (r - g) / d;
	}
	h *= 60;
	if(h < 0){
		h += 360;
	}
	h /= 360;//convert to standard 0.0 - 1.0 component
	return [h, s, v];
};
GraFlicUtil.HSV2RGB = function(h, s, v){
	var r, g, b, p, q, t, u, i, f;
	if(s == 0){//Grayscale
		return [v, v, v];
	}
	h *= 360;//convert from standard 0.0 - 1.0 component
	u = h;
	if(u >= 360){u = 0;}
	u /= 60;//hUe initial val copy
	i = Math.floor(u);//int
	f = u - i;//float remains
	p = v * ( 1 - s );
	q = v * ( 1 - (s * f) );
	t = v * ( 1 - (s * (1 - f) ) );
	if(i == 0){
		return [v, t, p];
	}
	if(i == 1){
		return [q, v, p];
	}
	if(i == 2){
		return [p, v, t];
	}
	if(i == 3){
		return [p, q, v];
	}
	if(i == 4){
		return [t, p, v];
	}
	return [v, p, q];//i == 5
};
GraFlicUtil.absorbJSON = function(jPrim, jSec, paramz){
	//jPrim, primary, will absorb the jSec (secondary) and the values in primary override secondary and are only copied if missing in primary.
	//This function is used to ensure initialization properties are set. If a JSON is missing required init properties, it will inherit the ones from jSec, which would usually be sent as a default initialized JSON.
	//It can also be used to cascade things when loading JSON configs, for example a JSON that only stores differences between a base configuration.
	//The root vars of the initiating recursive call should be the same typeof and either Object or Array.
	
	var sType, sVar, pVar, pType, jKey;
	
	//This will test for arrays that have a list of objects with an 'id' 
	/*if( typeof jPrim === 'array' && ( (jPrim[0] && jPrim[0].id) || (jSec[0] && jSec[0].id) )  ){
		var i, jPbyID = {}, jSbyID = {}, jPUpdated = [];
		for(i = 0;i < jPrim.length;i++){
			jPbyID[jPrim[i].id] = jPrim[i];
		}
		for(i = 0;i < jSec.length;i++){
			jSbyID[jSec[i].id] = jSec[i];
		}
		for(jKey in jSbyID){
			sVar = jSbyID[jKey];
			sType = typeof sVar;
			if(jPbyID[jKey]){
				pVar = jPbyID[jKey];
				pType = typeof pVar;
				if(pType === sType && (pType === 'object' || pType === 'array') && pVar != null && sVar != null ){//null will be type object.
					GraFlicUtil.absorbJSON(pVar, sVar, paramz);//If it can contain other vars, recur into it.
				}
				jPUpdated.push(pVar);
			}else{
				jPUpdated.push( JSON.parse(JSON.stringify(sVar)) );
			}
		}
		
		return jPrim;//========= this case has its own logic and will exit and not need the following code =================
	}*/
	
	for(jKey in jSec){//for in will work even for indexed array, as long as the order the indices are processed in is not important.
		sVar = jSec[jKey];
		sType = typeof sVar;
		if(jPrim[jKey]){
			pVar = jPrim[jKey];
			pType = typeof pVar;
			if(pType === sType && (pType === 'object' || pType === 'array') && pVar != null && sVar != null ){//null will be type object.
				GraFlicUtil.absorbJSON(pVar, sVar, paramz);//If it can contain other vars, recur into it.
			}
		}else{
			jPrim[jKey] = JSON.parse(JSON.stringify(sVar));//copy into string and parse as a new object so it will not be just linking to another object for object types. That could cause problems in some cases.
		}
	}
	return jPrim;
}
GraFlicUtil.makeCopyOfJSON = function(v_sourceObj){//static
	//Currently used to copy a palette object, may be useful for other things later too.
	var v_copyObj = {};
	for(var v_key in v_sourceObj){
		v_copyObj[v_key] = v_sourceObj[v_key];
	}
	return v_copyObj;
}

