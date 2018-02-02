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

.f is an Object that has properties, who are named with strings based on the filename, including any folder path if applicable. Use a for loop to cycle thru the files or if the save has preset filenames that control parts of the save, access them directly.
Examples:
returnedObject.f['save.json']
returnedObject.f['images/example.png']
Each file in files is an object and will have .d (data) for the raw binary, and in some cases have .b (blob link) with the ObjectURL blob link.
Other properties may be added later.
Maybe a .metadata to retain metadata about files like creation/modification time?
*/
function GraFlicArchive(zipDataUint8, paramz){
	//'this' object will be returned to the caller with contents of the ZIP.
	this.f = {};//each file will have potentially .d (data) containing the files, extracted and decompressed. The filename will be the key to access the file object in files. JSON will have .json containing the reconstituted JSON object. Text will have .t (text) containing the text string. JSON and text do not currently fill the .d property because it would not be very useful and would waste resources.
	this.j = {};//short links to .json ( JS-parsed and ready live JSON for stuff.json would be accessed at .j.stuff )
	//Images(PNG/JPG/GIF/WEBP) will have their raw binary appear in files in case metadata needs examining, and will also have an ObjectURL put here in images for easy loading by DOM elements in .b (blob link).
	//Other properties may be added to this result object later if needed.
	
	GraFlicArchive.archives.push(this);//Each archive created will be tracked here so that a file can be looked up if the path exists in any archive in memory with static getFileFromAny()
	
	var v_loadedFilename = '**__Unknown__**';
	if(paramz){
		if(paramz.filename){
		//If the filename is provided, it can be used to check for the common ZIP repackaging mistake of packaging the extracted folder inside of itself and correct it.
		//This often happens because ZIP extractors will extract the contents into a folder with the folder name based on the filename(without extension). 'A_file.zip' extracts into folder 'A_file/'. Naturally, after editing some of the ZIP contents, the user may context-click the folder and choose to compress. This seems like how it should work, but that will put everything in the new ZIP file into another layer of extra folder that was not in the original. A contained file 'images/example.png' would become 'A_file/images/example.png';
		v_loadedFilename = paramz.filename.replace(/\.[^\.\/]+$/, '');
		//TODO: Another approach that may be more reliable since the user may rename the zip after doing this: Detect if the root is empty except for one folder. If that is the case, then strip off the first folder from the extracted filename strings. Do note however, if the developer for some reason designed a save format to have a root that is empty except one folder, this could mess it up.
		}
		/*
		if(paramz.globalAsset){
			//being called with globalAsset true will tell it to keep the files in memory and set up the linkage so that the file can be used to fill custom zip links within the page with the images once they are extracted.
			//This is used when the custom:link rel="archive" element is detected to say that the page uses images/files stored in a zip file.
		}
		*/
	}//end if paramz defined.
	if(!zipDataUint8){
		//If called without a binary ZIP to load, make a blank GraFlicArchive that can be filled with files programmatically and saved.
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
	var v_extractedBytes;
	var v_fileHeadStart;
	var v_startCRC;
	var v_calcCRC32;
	var v_readCRC32;
	var v_decompressor;
	var v_compSig;//component signature
	var v_bitFlags;
	var v_relOffset;
	var v_offsetMode = 0;//0 for normal, 1 for undocumented mode some writers use that store the offset from the start of the file.
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
		if(v_relOffset == 0){v_offsetMode = 1;}
		//0 is never valid for the offset from central directory defined in the spec. If the first offset is 0, it must use the undocumented mode that uses the offset from the start of the file.
		if(v_offsetMode == 1){
			v_fileHeadStart = v_relOffset;
		}else{
			v_fileHeadStart = v_cdPos - v_relOffset;//go backwards by the offset bytes to locate the local file header.
		}
		console.log('version made by, version: ' + v_oct[v_cdPos + 4] + ' OS: ' + v_oct[v_cdPos + 5]);
		console.log('version needed to extract, version: ' + v_oct[v_cdPos + 6] + ' OS: ' + v_oct[v_cdPos + 7]);
		console.log('rel offset: ' + v_relOffset + ' starting at: ' + v_fileHeadStart);
		v_pos = v_fileHeadStart;
		v_payloadSize = GraFlicEncoder.readUint32(v_oct, v_cdPos + 20, true);//Read size out of central directory where it should be calculated. In the local file header it may be undefined if bit 3 of the flags is set. So far, this seems to reliably work to get payload size.
		v_cdFilenameSize = GraFlicEncoder.readUint16(v_oct, v_cdPos + 28, true);
		v_cdExtraFieldSize = GraFlicEncoder.readUint16(v_oct, v_cdPos + 30, true);//The extra field on central directory might be different from local file header.
		v_commentSize = GraFlicEncoder.readUint16(v_oct, v_cdPos + 32, true);//Comment ONLY appears on central directory header, NOT the local file header.

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
		v_decompressor = GraFlicUtil.noCompression;//default to 0, no compression
		console.log('compression mode: ' + v_payloadCompression);
		if(v_payloadCompression == 8){//DEFLATE
			v_decompressor = window.pako.inflateRaw;
		}
		if(v_filename.match(/(^|\/)\./)){           // || v_filename.match(/\..*\./)){
			//Throw out files that start with a dot.
			//These are probably system generated junk files, the save format does not use files named this way.
			//In *nix operating systems starting with a dot(.) is a hidden file, often some kind of system file.
			console.log('Skipping apparent junk file: ' + v_filename);
		}else{
			v_extractedBytes = v_oct.subarray(v_pos, v_pos + v_payloadSize);
			if(v_filename.match(/\//) && v_filename.split('/')[0].indexOf(v_loadedFilename) == 0){
							//(Remember, extra things like (2) may get appended to the filename if it gets renamed due to existing file that it was extracted from.)
				//If the files are in a folder with the same name as the loaded file, the user probably re-packed them
				//incorrectly which is easy to do, given the unintuitive way ZIPs extract out to a folder, but if you
				//compress the folder again, it puts the folder within the ZIP, so in that case, strip these out.
				v_filename = v_filename.replace(/^[^\/]+\//, '');
				console.log('The folder was repackaged inside of itself it seems. Filename fixed to: ' + v_filename);
			}
			var xFile = {};
			xFile.p = v_filename;//keep a reference for what the path is in case object referenced elsewhere.
			try{//-----------------------------------------------------------------------------------
			if(v_filename.match(/\.gz$/i)){
				//If .gz first decompress it with whatever compression method is defined in the ZIP entry (usually 0 none),
				//then set the decompressor to ungzip because .gz has internal compression of its own.
				v_extractedBytes = v_decompressor(v_extractedBytes);
				v_decompressor = window.pako.ungzip;
				console.log('.gz file, setting decompression to GZip, gz payload size: ' + v_extractedBytes.length);
			}
			//JSON and text will not have .d (data) populated since it is pretty useless in most cases and would waste resources.
			if(v_filename.match(/\.json(\.gz)?$/i)){
				//JSON needs extra logic to JSONize it into memory.
				xFile.j = JSON.parse(v_decompressor(v_extractedBytes, {'to':'string'}));
				//alert('extracted JSON(' + v_filename + '): ' + JSON.stringify(xFile));
				this.j[v_filename.replace(/\.json(\.gz)?$/i, '')] = xFile.j;//Set up a quick link for accessing JSON.
							//JSON files will typically contain the main configuration, parameters, and settings of a format
							//and need to be accessed often so .j.config.valX is less cluttered than: .f['config.json'].valX
							//do this after the file was successfully extracted
			}else if(v_filename.match(/\.txt(\.gz)?$/i)){
				xFile.t = v_decompressor(v_extractedBytes, {'to':'string'});
			}else{
				xFile.d = v_decompressor(v_extractedBytes);
				//Some browser may truncate the array text when tracing to debug and look like all zeroes.
				console.log('extracted U8Array(' + v_filename + '): ' + xFile + ' size: ' + xFile.d.length);
			}
			}catch(fileError){
				console.log('error reconstituting ' + v_filename + ', it may be a junk or auto-generated file.');
			}//-------------------------------- end try/catch ----------------------------------------

			//else if(v_filename.match(/\.(a*png|jpe*g|giff*|webp)(\.gz)?$/i)){
			//}
				//Keep image Uint8Array linked in case it needs to be examined for metadata such as EXIF rotation.
				//Also make a loadable BLOB ObjectURL so it can easily be loaded into images in the DOM.
				//Since the Uint8Array is used to build the BLOB for the ObjectURL, it would seem that dereferencing
				//it would probably not save any runtime resources, may as well keep it alive for analysis if needed.
			//make BLOBs for all files too
			xFile.d = v_decompressor(v_extractedBytes);
			this.fileToBLOB(xFile);
			this.f[v_filename] = xFile;//if completed with no errors, include it in the files object
			console.log('----------------------');
		}
		v_filesRead++;
	}//end while
};//(semicolon not needed since function definition not = function, but it appears to not effect things being here...) end of GraFlicArchive() constructor
GraFlicArchive.prototype.addFile = function(v_fileAdded){
	//required params:
	//.p (path)
	//some content, unless it is a folder
	//(.d (data) or .j (json) or .t (text) )
	//other properties:
	//.b - blob link, will be created based on .d data if present
	//.temp - if defined true, this will not be saved in the archive binary
		//In many cases there is temp data needed to function at run time but not needed in the save.
		//Setting these things up with separate logic can cause bloat and lots of redundant code in some cases.
		//For the sake of consistency and keeping the code trimmed down, adding it to the archive but setting .temp may be better.
	if(v_fileAdded.p.match(/\/[^\/]+$/)){//If a file, ensure the containing directory exists.
		var v_contDir = {};
		v_contDir.p = v_fileAdded.p.match(/^(.+\/)[^\/]/)[1];
		if(!this.f[v_contDir.p]){//If the folder already exists, leave it as it is. It may have properties like .temp set that should not be overwritten.
			this.addFile(v_contDir);//(If the containing folder is in a folder, this will be done again in the recursive call.)
		}
	}
	if(this.f[v_fileAdded.p] && this.f[v_fileAdded.p].b){
		//If overwriting the file, first destroy the previous blob
		URL.revokeObjectURL(this.f[v_fileAdded.p].b);
	}
	if(v_fileAdded.j){//Set up short link for json since JSON is very often accessed.
		//alert(v_fileAdded.p.replace(/\.json(\.gz)?$/i, ''));
		this.j[v_fileAdded.p.replace(/\.json(\.gz)?$/i,'')] = v_fileAdded.j;
	}
	this.f[v_fileAdded.p] = v_fileAdded;
	this.fileToBLOB(v_fileAdded);
};//end .addFile()
GraFlicArchive.prototype.deleteFile = function(v_fPath){
	if(this.f[v_fPath]){
		if(this.f[v_fPath].b){
			URL.revokeObjectURL(this.f[v_fPath].b);
		}
		var v_fPathNoExt = v_fPath.replace(/\.[^\.]+(\.gz)?$/i, '');
		if(this.j[v_fPathNoExt]){//if a quick access var for JS was created, remove it (example: .f['stuff.json'].j could be accessed at .j.stuff)
			delete this.j[v_fPathNoExt];
		}
		//TODO: would a this.t for quick .txt access be useful?
		delete this.f[v_fPath];
	}else{
		console.log('deleteFile(): ' + v_fPath + ' does not exist.');
	}
};
GraFlicArchive.prototype.fileToBLOB = function(v_srcFile){
	if(v_srcFile.d && v_srcFile.d.length){//BLOB creation may not be possible if .d (data) not set. BLOBs are mainly needed for things like images, which will have that
			//Folders may extract as a 0 length octet stream and do not need a BLOB.
		var objParamz = {};
		objParamz.type = 'application/octet-stream';
		//.gz will be auto decompressed on load, and auto-compressed internally on save (before being stored in the ZIP with method 0 no compression)
		var v_isImg = false;
		if(v_srcFile.p.match(/\.a*png(\.gz)?$/i)){objParamz.type = 'image/png';v_isImg = true;}
		if(v_srcFile.p.match(/\.jpe*g(\.gz)?$/i)){objParamz.type = 'image/jpeg';v_isImg = true;}
		if(v_srcFile.p.match(/\.giff*(\.gz)?$/i)){objParamz.type = 'image/gif';v_isImg = true;}
		if(v_srcFile.p.match(/\.webp(\.gz)?$/i)){objParamz.type = 'image/webp';v_isImg = true;}
		if(v_srcFile.p.match(/\.txt(\.gz)?$/i)){objParamz.type = 'text/plain';}
		if(v_srcFile.p.match(/\.json(\.gz)?$/i)){objParamz.type = 'application/json';}
		
		v_srcFile.b = URL.createObjectURL(  new Blob([v_srcFile.d], objParamz)  );
		if(v_isImg){//Create drawable image objects for images. The point of embedding images in web-app saves is to draw them!
			v_srcFile.i = new Image();
			v_srcFile.i.src = v_srcFile.b;
			v_srcFile.i.alt = v_srcFile.p;
		}
	}
};//end .fileToBLOB()
GraFlicArchive.prototype.listDir = function(v_dir){
	//Returns an array of files that are in the directory.
	var ls = [];
	for(var k in this.f){
		if(this.f[k].p.indexOf(v_dir) == 0 && this.f[k].p != v_dir){//The dir path is at the start of the file path
			ls.push(this.f[k]);
		}
	}
	return ls;
};
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
	blobMimetype will default to 'application/zip'. Many filetypes are just .zip with a different extension and mimetype.
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
	
	//This format should be ZIP based and even keep the .zip extension. Custom extensions without a widely known mime-type have a hard time being handled correctly for download in the various browsers. This also tells users, they can extract it, analyze it, edit it, replace files, and rebuild the zip to do things like replace embedded images or edit the JSON directly. Typically only advanced users would do this, but it is good to have as an option.
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
	for(v_iKey in this.f){
		console.log('[' + v_iKey + ']');
		curFile = this.f[v_iKey];
		if(curFile.temp){//Some files are temporarily used in run-time memory, but should not be saved to the archive.
			console.log('skipping temporary file: ' + curFile.p);
		}else{//--------------------- if not a temp file ------------------
		curFilePayload = curFile.d;
		curFileCompression = 8;//Default to method 8, Deflate.
		if(curFile.p.match(/\.json$/i)){
			//TODO: in some cases maybe JSON is pre-stringified and in .t instead of .j ??
			curFilePayload = GraFlicEncoder.stringToBytesUTF8(JSON.stringify(curFile.j, null, '\t'));//By default, use tab spacing to help readability.
			//Somehow previously, UTF seemed to work with just copying string to Uint8 array...?
			//But shouldn't this be a UTF-16 DOM String that needs conversion...? (It seems pako must have auto-handled the string.)
		}
		if(curFile.p.match(/\.txt$/i)){
			curFilePayload = GraFlicEncoder.stringToBytesUTF8(curFile.t);
		}
		if(curFile.p.match(/\.(gz|a*png|jpe*g|giff*|webp)$/i)){
			//GZip compressed files and Images have their own built-in compression, so compressing already compressed data is not efficient.
			curFileCompression = 0;
		}
		if(!curFilePayload){//if .d (data) is not set, then it is an empty entry like a folder
			curFilePayload = new Uint8Array(new ArrayBuffer(0));//Make 0 length data object.
			curFileCompression = 0;
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
		curFileUncompressedSize = curFilePayload.length;//save size before the Deflate.. (however, be sure to do this after logic so .gz has the correct original size, not size before internal gz compression)
		if(curFileCompression == 8){//if using compression. Only currently supports Deflate(8) or no compression (0).
			curFilePayload = window.pako.deflateRaw(curFilePayload, v_pakoDO);
		}
		console.log('queuing file: ' + curFile.p + ' dataSize: ' + curFilePayload.length + ' compress mode: ' + curFileCompression + ' original size: ' + curFileUncompressedSize);
		v_filesToWrite.push(
			GraFlicEncoder.stringToBytesUTF8(curFile.p),//get UTF-8 compatible Uint8Array... (JS 16-bit string chars do not translate to UTF-8)
			curFilePayload,
			curFileCompression,
			curFileUncompressedSize
		);
		v_fileCount++;
		}//---------------- end not temp file --------------------------
	}

	for(v_i = 0;v_i < v_filesToWrite.length;v_i += 4){//count the size of everything that was queue to be added to the file.
		v_saveLen += 76 + v_filesToWrite[v_i].length * 2 + v_filesToWrite[v_i + 1].length;
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
	jDate.setTime(jDate.getTime() - 21600000);//DATE time goes by -6 hours subtract that many milliseconds.
		//Still off on hours. If subtracting it goes to 12AM hours (0), if leaving as is it shows it modified tomorrow.
	//11111000 00000000 hours
	//00000111 11100000 mins
	//00000000 00011111 seconds
	var dHour = jDate.getUTCHours();
		//OLD:((jDate.getUTCHours() + 18) % 24) << 11;//5 bits (seems to be in a timezone off by 2 hours of UTC)
		//Subtract 6 hours. Add (24 -6) then mod for rollover. Regular subtraction could make invalid negative.
		//Daylight savings time may mess with it. -5 was working before, now -6 gets correct time.
	var dMin = jDate.getUTCMinutes() << 5;//6 bits
	var dSec = (jDate.getUTCSeconds() / 2);//4 bits
	
	//11111110 00000000 year
	//00000001 11100000 month
	//00000000 00011111 day
	var dYear = (jDate.getUTCFullYear() - 1980) << 9;
	var dMonth = (jDate.getUTCMonth() + 1) << 5;
	var dCalDay = jDate.getUTCDate();
	
	var packedTime = dSec | dMin | dHour;
	var packedDate = dCalDay | dMonth | dYear;
	
	for(v_i = 0;v_i < v_filesToWrite.length;v_i += 4){
		//[filename, payload, compression, original size, central directory header ... ] method sets.
		//Central directory will be null initially. It will be constructed here, since most of the values are the same as local file header, it is easy to copy. 
		var v_filenameBytesUTF8 = v_filesToWrite[v_i];//was set to AE.stringToBytesUTF8
		var v_filenameSize = v_filenameBytesUTF8.length;//Escaped %## for each UTF-8 byte. The stringByteLength func may not be needed since simple L/3 get it.
		//The ZIP spec does not officially support UTF-8 with a bit flag until a later version than the ubiquitous 2.0, but since UTF-8 is backwards compatible with ASCII, and codepage-based encodings have long been out of favor, it seems systems may be defaulting to interpreting it as UTF-8 anyways. So support UTF-8 anyways.
		var v_payload2Copy = v_filesToWrite[v_i + 1];
		var v_payloadSize = v_payload2Copy.length;
		//cdh array has [position of file header, cdc binary ... ] pairs. It needs to calculate the offset based on where the local file header starts.
		v_centralDirectoryHeaders.push(v_pos);
		//local file header signature
		GraFlicEncoder.writeUint32(v_oct, 0x04034B50, v_pos, true);
		v_pos += 4;
		var v_copyPosCDH = v_pos;//copy everything from here into the central directory header where it also appears.
		//2.0, version needed to extract. Assuming the 2 bytes are major version, minor version.
		v_oct[v_pos] = 20;//Lower byte(little-Endian), version code * 10
		v_oct[v_pos + 1] = 3;//Upper byte OS. 3 Is the code for *nix (Most general OS code, this is JS-based and the actual operating system cannot be reliably detected.)
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
		GraFlicEncoder.writeUint16(v_oct, v_filesToWrite[v_i + 2], v_pos, true);
		v_pos += 2;
		//MS-DOS format date and time.
		GraFlicEncoder.writeUint16(v_oct, packedTime, v_pos, true);
		v_pos += 2;
		GraFlicEncoder.writeUint16(v_oct, packedDate, v_pos, true);
		v_pos += 2;
		//CRC32 (Assuming CRC of the compressed or plain file itself.)
		GraFlicEncoder.writeUint32(v_oct, GraFlicEncoder.getCRC32(v_payload2Copy, 0, v_payload2Copy.length), v_pos, true);
		v_pos += 4;
		//compressed size
		GraFlicEncoder.writeUint32(v_oct, v_payloadSize, v_pos, true);
		v_pos += 4;
		
		//uncompressed size
		GraFlicEncoder.writeUint32(v_oct, v_filesToWrite[v_i + 3], v_pos, true);
		v_pos += 4;
		
		//filename length
		GraFlicEncoder.writeUint16(v_oct, v_filenameSize, v_pos, true);
		v_pos += 2;
		
		//extra field length. 0, does not use extra field.
		GraFlicEncoder.writeUint16(v_oct, 0, v_pos, true);
		v_pos += 2;
		GraFlicEncoder.writeUbytes(v_oct, v_filenameBytesUTF8, v_pos);
		v_pos += v_filenameBytesUTF8.length;
		/*
		//write filename (first remove first '%' and split to get the UTF-8 octet hex codes in an array)
		v_filenameBytesUTF8 = v_filenameBytesUTF8.substring(1).split('%');
		for(v_i2 = 0;v_i2 < v_filenameSize;v_i2++){
			v_filenameBytesUTF8[v_i2] = parseInt(v_filenameBytesUTF8[v_i2], 16);//Write the Hex string as binary byte for each escaped UTF-8 byte.
			v_oct[v_pos] = v_filenameBytesUTF8[v_i2];//(The parsed integer overwrites the string since this will be used later to writ it in CentralDir)
			v_pos++;
		}*/
		//========== Build the central directory header to be inserted in the list at the end of the file. =============
		v_centralDH = new Uint8Array(new ArrayBuffer(46 + v_filenameSize));
		//central directory has 16 additional bytes that the local file header does not, and of course the 4 byte signature is different
		for(v_i2 = 0;v_i2 < 26;v_i2++){
			//start copying to CDH after signature(4) and version made by(2)
			v_centralDH[6 + v_i2] = v_oct[v_copyPosCDH + v_i2];
		}
		v_centralDirectoryHeaders.push(v_centralDH);
		
		GraFlicEncoder.writeUint32(v_centralDH, 0x02014B50, 0, true);//signature
		
		v_centralDH[4] = 20;//Version made by * 10, 2.1
		v_centralDH[5] = 3;//OS code 3 *nix
		//... copied from local file header ...
		GraFlicEncoder.writeUint16(v_centralDH, 0, 30, true);//extra field length (do not use either of these extra/comment)
		GraFlicEncoder.writeUint16(v_centralDH, 0, 32, true);//comment length
		GraFlicEncoder.writeUint16(v_centralDH, 0x0000, 34, true);//disk number
		GraFlicEncoder.writeUint16(v_centralDH, 0x0000, 36, true);//internal file attributes
		GraFlicEncoder.writeUint32(v_centralDH, 0x00000000, 38, true);//external file attributes
		GraFlicEncoder.writeUint32(v_centralDH, 0x00000000, 42, true);//relative offset to local file header (will be filled in when the position it is offsetting from is known.)
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
	for(v_i = 0;v_i < v_centralDirectoryHeaders.length;v_i += 2){
		v_centralDH = v_centralDirectoryHeaders[v_i + 1];
		var v_correspondingFileHeaderPos = v_centralDirectoryHeaders[v_i];
		GraFlicEncoder.writeUint32(v_centralDH, v_pos - v_correspondingFileHeaderPos, 42, true);//relative offset to local file header
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
	
	var blobParams = {'type':'application/zip'};
	if(blobMimetype){
		if( (typeof blobMimetype) === 'string'){
			blobParams.type = blobMimetype;
		}else if( (typeof blobMimetype) === 'object'){
			blobParams = blobMimetype;
		}
	}
	this.b = URL.createObjectURL( new Blob([v_oct], blobParams) );
};//end GraFlicArchive.saveBLOB()
GraFlicArchive.archives = [];//A list of archives that have been loaded into memory. Useful for getting a file from any archive that has the path to it.
GraFlicArchive.getFileFromAny = function(fPath){
	//Static function. Will get the file at the path given if it exists in any archives that have been created, or return false if missing.
	//If there is a file with the same path in multiple archives, access it directly from he archive it is in.
	var curArchive;
	for(var i = 0;i < GraFlicArchive.archives.length;i++){
		curArchive = GraFlicArchive.archives[i];
		if(curArchive.f[fPath]){
			return curArchive.f[fPath];
		}
	}
	return false;
};
GraFlicArchive.prototype.revokeAll = function(){
	//This will remove the BLOB ObjectURL so that it frees memory and data used to build them can be garbage collected if dereferenced.
	//Once all BLOBs are revoked all that should be needed to garbage collect the files is to dereference the GraFlicArchive object.
	this.revokeFiles();
	this.revokeArchiveFile();
};
GraFlicArchive.prototype.revokeFiles = function(){
	var v_file;
	for(var v_iKey in this.f){
		v_file = this.f[v_iKey];
		if(v_file.b){URL.revokeObjectURL(v_file.b);}
	}
};
GraFlicArchive.prototype.revokeArchiveFile = function(){
	if(this.b){//Clear previous save to stop memory leak.
		URL.revokeObjectURL(this.b);
	}
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
GraFlicUtil.filenameSafe = function(fnStr, onlyASCII){
	//Remove non-filename-safe characters. This should be the non-letter, non-number ASCII characters.
	//non-ASCII UTF-8 characters are all, it would seem, safe for filenames
	//limit to one space in a row and make spacing all underscores
	fnStr = fnStr.replace(/[\x00-\x2C\x2E\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g, '_');
	if(onlyASCII){//If var defined and true.
		fnStr = fnStr.replace(/[^\x00-\x7F]/g, '_');
	}
	fnStr = fnStr.replace(/(^_|_$)/g, '');//no leading or trailing space
	//leave only 0x2D(hyphen), 0x30 - 0x39 (0-9), 0x41 - 0x5A (A-Z), 0x61 - 0x7A (a-z)
	return fnStr;
}
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

