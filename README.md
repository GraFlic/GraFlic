# AnimatedEncoder
A Javascript Library that allows you export to Animated Formats such as Animated PNG and Animated WEBP, leaveraging the browser's native encoding support to optimize performance. It is also useful for non-animated PNG. It can create lossy-style PNGs with a JPEG-like 0.0 - 1.0 quality parameter. The PNG will be optimized, quantizing and dithering uncommon colors. It can maintain good quality while greatly reducing file size.

Animated PNG will be supported in the majority of the 4 big browsers soon (Safari, Firefox, Chrome) when Chrome support is added, anticipated soon, since they are working on it as of Q4 2016.

WEBP is making advancements as well, with more browsers testing it.

If the pako script (Also MIT) is also included on your page, it can make even smaller Animated PNG files with 8-bit indexed PNG.
https://github.com/nodeca/pako/
AnimatedEncoder will detect it if present and make use of the pako deflate function to build a custom 8-bit IDAT/fdAT if it detects that indexed PNG is optimal.
