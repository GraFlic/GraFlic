#!/bin/bash

#This assumes the JSON is formatted with pretty returns.
#It also assumes the ID link (🖇️) for the language code will appear first, followed by the string dictionary (📖).
#The link (🖇️) should appear first for any object that has ID linkage.
#The memo string (📝) is ignored by localization and is a place for translation notes.
#If things mysteriously do not match, try deleting and re-inputing them in case of invisible control characters,
#or something editors that may change simple quote characters to fancy quotes causing it to not work.
#readmode:
#1: Find locale string such as ja_JP
#2: Find string ID such as 1001
#3: find string translation text(stored in "🌐":"...")
echo "hello"
#while TODO: loop thru list of HTML files
	string_file="locale.json"
	readmode=1
	while read -r line
	do
		#echo "processing line: $line"
		if (( $readmode > 100 ))
		then
			#start a delayed mode change
			#otherwise ending } could double process and exit to mode 1 too soon
			readmode=$((readmode-100))
			#echo "} reached, readmode going back to $readmode"
		fi
		if (( $readmode == 3 )) #----- find localized string -----
		then
			#match UTF-8 globe symbol \xF0\x9F\x8C\x90 with
			#replacement string in the contents
			#Note that the basic regex supported by BASH may not support lazy. Double quotes will need to be escaped(they need to be escaped anyways because they could break HTML.) Currently this only supports one line, with no line breaks.
			if [[ $line =~ \"🌐\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]
			then
				string_loc=${BASH_REMATCH[1]}
				echo "... with: $string_loc ..."
				#must not allow numbers directly after string_id,
				#or there could be collisions with other IDs
				to_replace="🖇$string_id[^0-9🌐]*🌐"
				#[^🌐]*🌐"
				echo "to_replace: $to_replace"
				#without "$filetext" in double quotes, sed seems to strip line feeds
				filetext=`echo "$filetext" | sed "s/$to_replace/$string_loc/g"`
				#filetext=${filetext//$to_replace/$string_loc}#basic bash has only very basic RegEx support
			else
				if [[ $line =~ \},*$ ]]
				then
					readmode=102
					#delay the mode change until the next line
				#else
					#echo "no match"
				fi
			fi
			#echo "mode 3"
		fi
		if (( $readmode == 2 )) #----- find string id -----
		then
			if [[ $line =~ \"🖇️\"[[:space:]]*:[[:space:]]*\"([0-9]+)\" ]]
			then
				string_id=${BASH_REMATCH[1]}
				readmode=3
				echo "Replacing $string_id ..."
			else
				if [[ $line =~ \},*$ ]]
				then
					#This is when the string object has been exited out of already
					#and the object for a given localization is being exited out of.
					readmode=101
					#+100 to delay mode change until next line
					#echo "done with $filetext"
					echo "Writing output to: $locale.html"
					echo "$filetext" > "$locale.html"
				#else
					#echo "no match"
				fi
			fi
			#echo "mode 2"
		fi
		if (( $readmode == 1 )) #----- find locale -----
		then
			#escape quotes and colon
			if [[ $line =~ \"🖇️\"[[:space:]]*:[[:space:]]*\"([a-zA-Z_-]+)\" ]]
			then
				#get a fresh copy of the base HTML/text and start
				#processing localized replacements for this locale
				locale=${BASH_REMATCH[1]}
				readmode=2
				filetext=`cat Graflic_canvas.html`
				echo "----- localizing for $locale -----"
			#else
				#echo "no match"
			fi
			#echo "mode 1"
		fi
	done < "$string_file"
#done #end HTML file loop