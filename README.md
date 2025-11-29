# Clovelt's Construct 3 Project Browser

A client-side file browser designed to explore, preview, and interact with a remote collection of Construct 3 projects and assets. This tool provides UX for navigating a file server, previewing project details, and even running web-based game builds directly in the browser.

## Features

- **Dynamic File Tree:** Automatically generates a collapsible file tree from a remote directory listing.
- **Rich Previews:** When a `.zip` file is selected, it generates a detailed preview pane.
  - Displays associated images (`.gif`, `.png`) and text files (`.txt`).
  - Parses `.txt` files for metadata like `Title`, `Author`, and `Tags` to create a styled info box.
  - Shows file metadata including size and upload date.
- **In-Browser Game Execution:**
  - **"Play Game":** Runs HTML5 games from within a zip file directly in a new tab.
  - **"Live Preview":** Opens the game in a draggable, resizable popup window for quick testing.
  - Achieved via a JavaScript sandbox that intercepts file requests using Blob URLs, allowing games to run without being traditionally hosted.
- **Smart Downloading:** Automatically detects and provides download links for related project files:
  - Game builds (`_web.zip`, `_win.zip`, `_mac.zip`).
  - Construct project source files (`.c3p`, `.capx`).
- **Deep Linking & Sharing:**
  - Generate a shareable URL that links directly to a specific project preview (`?zip=...`).
  - Generate a URL that immediately launches a game (`?play=...`).
- **Customizable UI:**
  - Supports a custom `banner.png` or `banner.gif` in the root directory.
  - Light and Dark mode themes, with user preference saved to `localStorage`.
  - Responsive design for usability on mobile devices.
- **Password Protection:** Basic locked folders with a `_password.txt` file, prompting the user for a password before granting access.

## File Structure

The browser relies on specific file naming conventions within the remote directory to enable its features.

```
📁 /
├── 📁 Game/
│   ├── 📄 Game.zip           # (Required) The base file to be listed.
│   ├── 📄 Game.txt           # (Optional) A text file with metadata for the preview.
│   ├── 📄 Game_icon.png      # (Optional) An icon for the file tree and preview header.
│   ├── 📄 Game.gif           # (Optional) A preview image/GIF.
│   ├── 📄 Game_web.zip       # (Optional) "Download Web" button will appear.
│   ├── 📄 Game_win.zip       # (Optional) "Download Windows" button will appear.
│   ├── 📄 Game_mac.zip       # (Optional) "Download Mac" button will appear.
│   └── 📄 Game.c3p           # (Optional) "Download Source" button will appear.
│
├── 📁 MySecretProject/
│   ├── 📄 _password.txt              # This folder is now password protected.
│   └── 📄 SuperSecret.zip
│
└── 📄 banner.png                      # (Optional) Replaces the main title with a banner image.
```

### Hiding Files

To keep the file tree clean, the browser automatically hides certain files from view:

- `_password.txt` files are never shown.
- Platform-specific zips (`_win.zip`, `_mac.zip`) are hidden if a corresponding base `.zip` file exists in the same folder.

## How It Works

The application is entirely client-side. It works by:

1. **Fetching:** It starts at the `API_URL` defined in `index.js` and recursively fetches the directory listings. It expects the server to return a simple HTML page with `<a>` tags for files and folders.
2. **Parsing:** It parses the HTML to build a JSON representation of the file structure.
3. **Rendering:** It renders the file structure into the interactive tree using JavaScript.
4. **Sandboxing (for Game Previews):** When a user clicks "Play", the browser:
   - Fetches the selected `.zip` file.
   - Unpacks it in memory using `JSZip.js`.
   - Creates a unique `blob:` URL for every single file inside the zip.
   - Injects a script into the game's `index.html` that patches `window.fetch` and `self.importScripts`.
   - This patch intercepts all of the game's requests for its own assets (like `c3runtime.js`, images, sounds) and redirects them to the corresponding `blob:` URL, allowing the game to run entirely from the user's memory.

## Setup

1. **Host Files:** Place your project files `index.html`, `style.css`, and `index.js` on a web server that provides a basic directory listing. Ensure CORS headers (like `Access-Control-Allow-Origin: *`) are configured to allow the browser to fetch the file listings and content.
2. **Add Content:** Any file you place in the `content` folder will be parsed according to the `File Structure` section.

## Troubleshooting: `.htaccess` for the `content` Folder

In case you get read errors due to CORS issues, you can try including the following `.htaccess` file inside your `content/` folder:

<pre class="overflow-visible!" data-start="249" data-end="613"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-apache"><span>Options +Indexes
IndexOptions +FancyIndexing

# Enable CORS inside /content
<IfModule mod_headers.c>
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE"
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
</IfModule>
</span></code></div></div></pre>

### What This Enables

* Directory listings (`<a>` links) required for the file tree.
* Cross-origin fetching of `.zip`, `.txt`, `.png`, `.gif`, and other assets.
* Full compatibility with the in-browser Construct 3 runtime sandbox.
* Works even if your main server configuration does not enable CORS globally.
