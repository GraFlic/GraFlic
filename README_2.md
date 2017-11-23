# AnimatedEncoder
A Javascript Library that allows you export to Animated Formats such as Animated PNG and Animated WEBP, leaveraging the browser's native encoding support to optimize speed or using powerful libraries to get optimal file size. It is also useful for non-animated PNG. It can create lossy-style PNGs with a 0.0 - 1.0 quality parameter. The PNG will be optimized, quantizing and dithering uncommon colors. It can maintain good quality while greatly reducing file size.

Animated PNG will be supported in the majority of the 4 big browsers soon (Safari, Firefox, Chrome) when Chrome support is added, anticipated soon, since they are working on it as of early 2017.

WEBP is making advancements as well, with more browsers testing it.

If the Zopfli and/or pako library scripts are included on your page, it can make even smaller Animated PNG files with various techniques such as 8-bit indexed PNG, 24-bit RGB PNG for opaque images, byte filtering optimization, and brute force compression.

https://github.com/imaya/zopfli.js (The Apache License 2.0)

( ported from https://github.com/google/zopfli )  (The Apache License 2.0)

https://github.com/nodeca/pako/ (MIT License)

AnimatedEncoder will detect them if present and make use of the Zopfli and/or pako DEFLATE functions to build custom IDAT/fdAT image streams for the PNG. It will be optimized based on the quality and other parameters.
