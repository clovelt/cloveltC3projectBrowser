document.addEventListener('DOMContentLoaded', () => {
    const API_URL = location.protocol==="file:" ? "https://gustavochico.com/browserpike/content/" : location.hostname==="localhost" ? "http://localhost:3000/browserpike/content/" : location.origin + location.pathname.split("/content/")[0] + "/content/";
    const fileTree = document.getElementById('file-tree');
    const loader = document.getElementById('loader');
    const previewContainer = document.getElementById('preview-container');
    const welcomeMessage = document.getElementById('welcome-message');
    const previewContent = document.getElementById('preview-content');
    const previewTitle = document.getElementById('preview-title');
    const previewActions = document.getElementById('preview-actions'); // FIX: Added this line
    const previewTitleIcon = document.getElementById('preview-title-icon');
    const previewArea = document.getElementById('preview-area');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const downloadWinBtn = document.getElementById('download-win-btn');
    const downloadMacBtn = document.getElementById('download-mac-btn');
    const playBtn = document.getElementById('play-btn'); // Added play button
    const originalZipNameSpan = document.getElementById('original-zip-name'); // New span
    const linkedTextFileSpan = document.getElementById('linked-text-file'); // New span
    const linkedImageFileSpan = document.getElementById('linked-image-file'); // New span
    const uploadDateSpan = document.getElementById('upload-date');
    const externalPreviewBtn = document.getElementById('external-preview-btn');
    const shareBtn = document.getElementById('share-btn');
    const shareModeToggle = document.getElementById('share-mode-toggle');
    const shareControlsWrapper = document.getElementById('share-controls-wrapper');
    const reloadBtn = document.getElementById('reload-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const expandAllBtn = document.getElementById('expand-all-btn');
    const collapseAllBtn = document.getElementById('collapse-all-btn');

    const downloadProjectBtn = document.getElementById('download-project-btn'); // New button
    const popupNewTabBtn = document.getElementById('popup-newtab');


    let currentZipUrl = null;
    let currentZipPath = null; // To store the relative path of the current zip
    let currentPopupBlobUrl = null; // To store the Blob URL for the popup's "open in new tab" button
    const unlockedFolders = new Set(); // To store paths of unlocked folders for the session

    // --- Utility Functions ---

    const showLoader = (message) => {
        loader.querySelector('p').textContent = message;
        loader.classList.add('visible');
    };

    const hideLoader = () => {
        loader.classList.remove('visible');
    };

    const formatName = (name) => {
        let decodedName = name;
        try {
            decodedName = decodeURIComponent(name);
        } catch (e) {
            // If it fails, just use the original name.
            console.warn(`Could not decode name: ${name}`, e);
        }
        return decodedName.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).trim();
    };

    const parseAndStyleText = (text) => {
        const lines = text.split('\n');
        const metadata = {};
        let description = '';
        let isDescription = false;

        lines.forEach(line => {
            if (line.trim() === '') return;
            if (isDescription) {
                description += line + '\n';
                return;
            }

            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
                const key = match[1].trim().toLowerCase();
                const value = match[2].trim();
                metadata[key] = value;
                if (key === 'description') {
                    isDescription = true;
                    description = value + '\n';
                }
            } else {
                description += line + '\n';
            }
        });

        const tagsHTML = metadata.tags ? metadata.tags.split(',').map(tag => `<span>${tag.trim()}</span>`).join('') : '';
        return `
            <div class="styled-text-preview">
                ${metadata.title ? `<h3>${metadata.title}</h3>` : ''}
                ${metadata.author ? `<p class="meta-item"><strong>Author:</strong> ${metadata.author}</p>` : ''}
                ${tagsHTML ? `<div class="meta-item meta-tags"><strong>Tags:</strong> ${tagsHTML}</div>` : ''}
                ${description ? `<div class="description"><p>${description.replace(/\n/g, '<br>')}</p></div>` : ''}
            </div>
        `;
    };

    // --- File Tree Logic ---

    const createTree = (paths) => {
        const tree = {};
        paths.forEach(path => {
            let currentLevel = tree;
            path.split('/').forEach(part => {
                if (part) {
                    if (!currentLevel[part]) {
                        currentLevel[part] = {};
                    }
                    currentLevel = currentLevel[part];
                }
            }); 
        });
        return tree;
    };

    // Helper to find a file in the same directory as another file
    const findSiblingFile = (fileStructure, targetPath, siblingFileName) => {
        const pathParts = targetPath.split('/').filter(part => part !== '');
        let currentLevel = fileStructure;

        // Traverse to the directory of the target file
        // We go up to pathParts.length - 1 to stop at the parent directory
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (currentLevel[part]) {
                currentLevel = currentLevel[part];
            } else {
                return null; // Directory not found
            }
        }

        // Now 'currentLevel' is the directory where the target file resides
        // Check if the sibling file exists at this level
        return currentLevel[siblingFileName] ? targetPath.substring(0, targetPath.lastIndexOf('/') + 1) + siblingFileName : null;
    };

    const renderTree = (node, container, path = '') => {
        const ul = document.createElement('ul');
        Object.keys(node).sort().forEach(key => {
            const li = document.createElement('li');
            const currentPath = path ? `${path}/${key}` : key;
            const isZip = key.endsWith('.zip');
            const isFolder = !isZip && Object.keys(node[key]).length > 0;

            // --- Hide platform-specific zips if a base zip exists ---
            if (isZip && (key.endsWith('_win.zip') || key.endsWith('_mac.zip'))) {
                const baseName = key.replace(/_win\.zip$|_mac\.zip$/, '');
                const baseZipFile = `${baseName}.zip`;
                // If the corresponding base zip file exists at the same level, skip rendering this one.
                if (node.hasOwnProperty(baseZipFile)) {
                    return; // Don't render this item
                }
            }

            if (key === '_password.txt') return; // Don't render password files

            const itemSpan = document.createElement('span');
            itemSpan.className = 'tree-item';
            itemSpan.textContent = formatName(key.replace('.zip', ''));
            li.appendChild(itemSpan);

            if (isFolder) {
                li.className = 'folder';
                const isProtected = !!node[key]['_password.txt'];
                if (isProtected) {
                    li.classList.add('protected');
                }

                itemSpan.addEventListener('click', async (e) => {
                    e.stopPropagation();

                    if (isProtected && !unlockedFolders.has(currentPath)) {
                        const password = await promptForPassword();
                        if (password === null) return; // User cancelled

                        try {
                            const passwordUrl = new URL(currentPath + '/_password.txt', API_URL).href;
                            const response = await fetch(passwordUrl);
                            if (!response.ok) throw new Error("Could not fetch password file.");
                            const correctPassword = (await response.text()).trim();

                            if (password === correctPassword) {
                                unlockedFolders.add(currentPath);
                                li.classList.add('unlocked');
                                li.classList.toggle('open');
                                li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            } else {
                                alert('Incorrect password.');
                            }
                        } catch (err) {
                            console.error("Password check failed:", err);
                            alert("Could not verify password.");
                        }
                    } else {
                        li.classList.toggle('open');
                        li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                });
                renderTree(node[key], li, currentPath);
            } else if (isZip) {
                const iconFile = key.replace('.zip', '_icon.png');
                if (node[iconFile]) {
                    li.classList.add('has-icon');
                    const iconImg = document.createElement('img');
                    iconImg.className = 'file-icon';
                    iconImg.src = new URL(path ? `${path}/${iconFile}` : iconFile, API_URL).href;
                    itemSpan.prepend(iconImg);
                } else {
                    li.className = 'file-zip';
                }

                itemSpan.dataset.path = currentPath;
                itemSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleZipClick(currentPath, itemSpan);
                });
            }

            // Only append folders and zip files to the visual tree
            if (isFolder || isZip) {
                ul.appendChild(li);
            }
        });
        container.appendChild(ul);
    };

    // --- Preview Logic ---

    const handleZipClick = async (path, element) => {
        document.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
        element.classList.add('active');

        showLoader('Loading zip file...');
        currentZipPath = path; // Store the current path
        currentZipUrl = new URL(path, API_URL).href;
        
        try {
            const response = await fetch(currentZipUrl, { timeout: 20000 }); // Added timeout
            if (!response.ok) {
                if (response.status === 0 && response.statusText === '') { // Likely a network error or CORS
                    throw new Error(`Network error or CORS issue. Could not fetch zip file from ${currentZipUrl}`);
                }
                throw new Error(`HTTP error! status: ${response.status} for ${currentZipUrl}`);
            }
            const blob = await response.blob(); // Get blob to calculate size
            const zip = await JSZip.loadAsync(blob);

            const zipName = path.split('/').pop().replace('.zip', '');

            // --- External File Detection (in the same folder as the zip) ---
            const externalLinkedTextFile = findSiblingFile(fileStructure, path, `${zipName}.txt`);
            const externalLinkedImageFile = findSiblingFile(fileStructure, path, `${zipName}.gif`) || findSiblingFile(fileStructure, path, `${zipName}.png`);
            const externalCapxFile = findSiblingFile(fileStructure, path, `${zipName}.capx`);
            const externalC3pFile = findSiblingFile(fileStructure, path, `${zipName}.c3p`);
            const externalWebZip = findSiblingFile(fileStructure, path, `${zipName}_web.zip`);
            const externalWinZip = findSiblingFile(fileStructure, path, `${zipName}_win.zip`);
            const externalIconFile = findSiblingFile(fileStructure, path, `${zipName}_icon.png`);
            const externalMacZip = findSiblingFile(fileStructure, path, `${zipName}_mac.zip`);

            
            // Find best matching files for preview
            const files = Object.keys(zip.files);
            let previewFile = null;
            let previewType = null;
            let indexHtmlFile = null; // Specific for Play button
            let anyHtmlFileForExternalPreview = null; // To store any HTML file for the external preview button


            // --- Preview File Prioritization ---
            // 1. Check for index.html (for Play button and potential preview)
            indexHtmlFile = files.find(f => f.toLowerCase() === 'index.html');
            if (indexHtmlFile) {
                anyHtmlFileForExternalPreview = indexHtmlFile;
            }

            // 2. Look for specific image matching zip name (e.g., againstTheCrowd.gif)
            const specificImage = files.find(f => f.toLowerCase() === `${zipName}.gif` || f.toLowerCase() === `${zipName}.png`);
            if (specificImage) {
                previewFile = specificImage;
                previewType = 'image';
                linkedImageFile = specificImage;
            }

            // 3. Look for specific text matching zip name (e.g., againstTheCrowd.txt)
            const specificText = files.find(f => f.toLowerCase() === `${zipName}.txt`);
            if (!previewFile && specificText) {
                previewFile = specificText;
                previewType = 'text';
                linkedTextFile = specificText;
            }

            // 4. Look for general info.txt or README.txt
            const infoFile = files.find(f => f.toLowerCase() === 'info.txt' || f.toLowerCase() === 'readme.txt');
            if (!previewFile && infoFile) {
                previewFile = infoFile;
                previewType = 'text';
                linkedTextFile = infoFile;
            }

            // 5. Look for any other common image file
            const anyImage = files.find(f => f.match(/\.(png|jpg|jpeg|gif)$/i));
            if (!previewFile && anyImage) {
                previewFile = anyImage;
                previewType = 'image';
                linkedImageFile = anyImage;
            }

            // 6. Look for any other common text file
            const anyText = files.find(f => f.match(/\.txt$/i));
            if (!previewFile && anyText) {
                previewFile = anyText;
                previewType = 'text';
                linkedTextFile = anyText;
            }

            // 7. Fallback to index.html as a preview if nothing else suitable
            if (!previewFile && indexHtmlFile) {
                previewFile = indexHtmlFile;
                previewType = 'html';
            }

            // 8. Look for any other HTML file as a last resort for preview
            const otherHtml = files.find(f => f.match(/\.html$/i) && f !== indexHtmlFile);
            if (!previewFile && otherHtml) {
                previewFile = otherHtml;
                previewType = 'html';
                if (!anyHtmlFileForExternalPreview) { // If index.html wasn't found, use this for external preview
                    anyHtmlFileForExternalPreview = otherHtml;
                }
            }
            // --- End Preview File Prioritization ---

            previewTitle.textContent = formatName(zipName);
            previewArea.innerHTML = '';

            // --- Get and format upload date from Last-Modified header ---
            const lastModified = response.headers.get('Last-Modified');
            if (lastModified) {
                const date = new Date(lastModified);
                uploadDateSpan.textContent = date.toLocaleString();
            } else {
                uploadDateSpan.textContent = 'N/A';
            }
            // Update file info section
            originalZipNameSpan.textContent = decodeURIComponent(path.split('/').pop());
            document.getElementById('zip-file-size').textContent = `${(blob.size / (1024 * 1024)).toFixed(2)} MB`; // Display size in MB
            linkedTextFileSpan.textContent = externalLinkedTextFile ? externalLinkedTextFile.split('/').pop() : 'N/A';
            linkedImageFileSpan.textContent = externalLinkedImageFile ? externalLinkedImageFile.split('/').pop() : 'N/A';

            // --- Render Preview Area ---
            let previewHTML = '';

            // 0. Set title icon
            if (externalIconFile) {
                previewTitleIcon.src = new URL(externalIconFile, API_URL).href;
                previewTitleIcon.style.display = 'inline-block';
            } else {
                previewTitleIcon.style.display = 'none';
            }

            // 1. Render external sibling image if it exists
            if (externalLinkedImageFile) {
                try {
                    const imageUrl = new URL(externalLinkedImageFile, API_URL).href;
                    previewHTML += `<img src="${imageUrl}" alt="${externalLinkedImageFile.split('/').pop()}">`;
                } catch (error) {
                    console.error('Error creating URL for external image:', error);
                }
            }

            // 2. Render external sibling text file if it exists
            if (externalLinkedTextFile) {
                try {
                    const response = await fetch(new URL(externalLinkedTextFile, API_URL).href);
                    if (response.ok) {
                        const textContent = await response.text();
                        previewHTML += parseAndStyleText(textContent);
                    } else {
                        throw new Error(`Status: ${response.status}`);
                    }
                } catch (error) {
                    console.error(`Error loading external text file ${externalLinkedTextFile}:`, error);
                    previewHTML += `<p style="color: #ff8a80;">Could not load linked text file.</p>`;
                }
            }

            // 3. If no external content was rendered, show a message
            if (previewHTML === '') {
                previewHTML = '<p></p>';
            }
            previewArea.innerHTML = previewHTML;
            
            const createSandboxHtml = async (zip, htmlFile) => {
                let htmlContent = await zip.file(htmlFile).async("string");
                const fileMap = {};

                for (const fileName in zip.files) {
                    if (!zip.files[fileName].dir) {
                        const fileBlob = await zip.file(fileName).async('blob');
                        fileMap[fileName] = URL.createObjectURL(fileBlob);
                    }
                }
                
                const scriptContent = `
                    const fileMap = ${JSON.stringify(fileMap)};
                    self.C3_ZIP_FILE_MAP = fileMap; // Make fileMap available globally for workers

                    // Patch fetch() to redirect to blob URLs
                    const originalFetch = window.fetch;
                    window.fetch = function(resource, options) {
                        const requestedUrl = new URL(resource, location.origin).pathname;
                        const path = requestedUrl.startsWith('/') ? requestedUrl.substring(1) : requestedUrl;
                        
                        if (fileMap.hasOwnProperty(path)) {
                            return originalFetch(fileMap[path], options);
                        }
                        return originalFetch(resource, options);
                    };

                    // Patch importScripts() for workers, which is how C3 loads its runtime
                    const original_importScripts = self.importScripts;
                    self.importScripts = function(...urls) {
                        const blobUrls = urls.map(url => {
                            const requestedUrl = new URL(url, location.origin).pathname;
                            const path = requestedUrl.startsWith('/') ? requestedUrl.substring(1) : requestedUrl;
                            return fileMap[path] || url;
                        });
                        return original_importScripts(...blobUrls);
                    };
                `;

                // Inject the patch script into the head of the game's HTML
                htmlContent = htmlContent.replace(/<head>/, `<head><script>${scriptContent}<\/script>`);

                return htmlContent;
            };

            // --- Handle Download Buttons ---
            const urlParams = new URLSearchParams(window.location.search);
            const isAdmin = urlParams.has('admin');

            const setupDownloadButton = (button, filePath, defaultFileName) => {
                if (filePath) {
                    button.style.display = 'inline-block';
                    button.onclick = async () => {
                        try {
                            const downloadUrl = new URL(filePath, API_URL).href;
                            const response = await fetch(downloadUrl);
                            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = defaultFileName || filePath.split('/').pop();
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            a.remove();
                        } catch (e) {
                            console.error('Download failed:', e);
                            alert('Could not download the file.');
                        }
                    };
                } else {
                    button.style.display = 'none';
                }
            };

            // Setup each download button
            setupDownloadButton(downloadZipBtn, externalWebZip, `${zipName}_web.zip`);
            setupDownloadButton(downloadWinBtn, externalWinZip, `${zipName}_win.zip`);
            setupDownloadButton(downloadMacBtn, externalMacZip, `${zipName}_mac.zip`);

            // Update "Play Game" button
            if (indexHtmlFile) { // Only enable Play button for index.html
                playBtn.style.display = 'inline-block';
                playBtn.onclick = async () => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const playMode = urlParams.has('play');
                    const sandboxHtml = await createSandboxHtml(zip, indexHtmlFile);

                    if (playMode) {
                        // If in play mode, create a blob URL and navigate the current tab to it.
                        const blob = new Blob([sandboxHtml], { type: 'text/html' });
                        window.location.href = URL.createObjectURL(blob);
                    } else {
                        const newTab = window.open();
                        if (newTab) {
                            newTab.document.write(sandboxHtml);
                            newTab.document.close();
                        }
                    }
                };
            } else {
                playBtn.style.display = 'none';
            }

            // Update "Live Preview" button for any HTML file
            externalPreviewBtn.style.display = anyHtmlFileForExternalPreview ? 'inline-block' : 'none';
            if (anyHtmlFileForExternalPreview) {
                externalPreviewBtn.onclick = async () => {                    
                    // For the popup, we still need a blob URL, but we'll use the same sandboxing logic.
                    const sandboxedContent = await createSandboxHtml(zip, anyHtmlFileForExternalPreview);
                    const htmlBlobUrl = URL.createObjectURL(new Blob([sandboxedContent], {
                        type: 'text/html'
                    }));

                    // The iframe will now load the blob URL containing the patched HTML.
                    const iframeContent = `<iframe src="${htmlBlobUrl}" style="width:100%; height:100%; border:none;"></iframe>`;
                    showPopup(zipName, iframeContent, htmlBlobUrl);
                };
            }

            // Update "Download Project" button for external .capx or .c3p files
            if (externalCapxFile || externalC3pFile) {
                downloadProjectBtn.style.display = 'inline-block';
                const projectFile = externalCapxFile || externalC3pFile;
                downloadProjectBtn.textContent = `⬇️ Download Source (.${projectFile.split('.').pop()})`;
                downloadProjectBtn.onclick = async () => {
                    try {
                        const projectUrl = new URL(projectFile, API_URL).href;
                        const response = await fetch(projectUrl);
                        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = projectFile.split('/').pop();
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        a.remove();
                    } catch (e) {
                        console.error('Download failed:', e);
                        alert('Could not download the project file.');
                    }
                };
            } else {
                downloadProjectBtn.style.display = 'none';
            }
            welcomeMessage.classList.add('hidden');
            previewContent.classList.remove('hidden');
            updateShareUrl(path);

        } catch (error) {
            console.error('Error loading or processing zip file:', error);
            previewArea.innerHTML = `<p style="color: #ff8a80;">Error loading preview: ${error.message}. Please check the console for more details.</p>`;
        } finally {
            hideLoader();
        }
    };

    const updateShareUrl = (path) => {
        const isPlayMode = shareModeToggle.checked;
        const url = new URL(window.location.href);
        url.searchParams.forEach((_, key) => url.searchParams.delete(key)); // Clear existing params

        if (isPlayMode) {
            url.searchParams.set('play', path);
        } else {
            url.searchParams.set('zip', path);
        }
        shareBtn.dataset.url = url.toString();
    };

    // --- Action Buttons ---

    shareBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(shareBtn.dataset.url).then(() => {
            const originalText = shareBtn.innerHTML;
            shareBtn.innerHTML = '✅ Copied!';
            setTimeout(() => { shareBtn.innerHTML = originalText; }, 2000);
        });
    });

    shareModeToggle.addEventListener('change', () => {
        if (currentZipPath) updateShareUrl(currentZipPath); // This will now correctly update the URL
    });

    reloadBtn.addEventListener('click', () => {
        // Clear the tree and re-initialize
        fileTree.innerHTML = '';
        welcomeMessage.classList.remove('hidden');
        previewContent.classList.add('hidden');
        init();
    });

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        // Save theme preference
        if (document.body.classList.contains('light-mode')) {
            localStorage.setItem('theme', 'light');
        } else {
            localStorage.setItem('theme', 'dark');
        }
    });

    expandAllBtn.addEventListener('click', () => {
        // Expand all folders that are not protected, or are protected but have been unlocked.
        fileTree.querySelectorAll('.folder').forEach(folder => {
            if (!folder.classList.contains('protected') || folder.classList.contains('unlocked'))
                folder.classList.add('open');
        });
    });

    collapseAllBtn.addEventListener('click', () => {
        fileTree.querySelectorAll('.folder.open').forEach(folder => {
            folder.classList.remove('open');
        });
    });

    // --- Popup Window Logic ---
    const popup = document.getElementById('popup-viewer');
    const popupHeader = popup.querySelector('.popup-header');
    const popupTitle = popup.querySelector('.popup-title');
    const popupContent = popup.querySelector('.popup-content');
    const closeBtn = popup.querySelector('.popup-close');
    // const maximizeBtn = popup.querySelector('.popup-maximize'); // Removed

    let isDragging = false;
    let offsetX, offsetY;
    let isMaximized = false;
    let lastPos = {};

    const showPopup = (title, content, blobUrlForNewTab = null) => {
        popupTitle.textContent = title;
        popupContent.innerHTML = content;
        popup.classList.remove('hidden');

        currentPopupBlobUrl = blobUrlForNewTab;
        if (blobUrlForNewTab) {
            popupNewTabBtn.style.display = 'inline-block';
            popupNewTabBtn.onclick = () => {
                window.open(blobUrlForNewTab, '_blank');
            };
        } else {
            popupNewTabBtn.style.display = 'none';
            popupNewTabBtn.onclick = null;
        }

        // Reset popup position if it was maximized
        if (isMaximized) {
            popup.style.top = '50%';
            popup.style.left = '50%';
            popup.style.width = '60vw';
            popup.style.height = '70vh';
            isMaximized = false;
        }
    };

    closeBtn.addEventListener('click', () => popup.classList.add('hidden'));

    // The new "Open in new tab" button in the popup
    popupNewTabBtn.addEventListener('click', () => {
        const playButton = document.getElementById('play-btn');
        if (currentPopupBlobUrl) {
            window.open(currentPopupBlobUrl, '_blank');
            return;
        }
        // Fallback to play button logic if no specific popup URL is set
        if (playButton && playButton.style.display !== 'none' && playButton.onclick) {
            playButton.onclick();
        }
    });

    popupHeader.addEventListener('mousedown', (e) => {
        if (isMaximized) return;
        isDragging = true;
        offsetX = e.clientX - popup.offsetLeft;
        offsetY = e.clientY - popup.offsetTop;
        popup.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        popup.style.left = `${e.clientX - offsetX}px`;
        popup.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        popup.style.cursor = 'default';
    });

    // --- Password Prompt Logic ---
    const passwordPrompt = document.getElementById('password-prompt');
    const passwordInput = document.getElementById('password-input');
    const passwordSubmit = document.getElementById('password-submit');
    const passwordCancel = document.getElementById('password-cancel');
    let passwordPromiseResolve = null;

    function promptForPassword() {
        passwordPrompt.classList.remove('hidden');
        passwordInput.value = '';
        passwordInput.focus();
        return new Promise(resolve => {
            passwordPromiseResolve = resolve;
        });
    }

    passwordSubmit.addEventListener('click', () => {
        passwordPrompt.classList.add('hidden');
        if (passwordPromiseResolve) passwordPromiseResolve(passwordInput.value);
    });

    passwordCancel.addEventListener('click', () => {
        passwordPrompt.classList.add('hidden');
        if (passwordPromiseResolve) passwordPromiseResolve(null);
    });

    // --- Initialization ---

    const fetchAndParseLinks = async (url) => {
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const text = await response.text();
            // Use regex to parse Apache/nginx directory listing, which is more reliable than DOM parsing
            const regex = /<a href="([^"]+)">/g;
            const links = [];
            let match;
            while ((match = regex.exec(text)) !== null) {
                links.push(match[1]);
            }
            return links
                .filter(href => {
                    // Ignore parent directory links, mailto, etc.
                    return href && !href.startsWith('?') && !href.startsWith('/') && !href.includes(':') && href !== './';
                });
        } catch (error) {
            console.error(`Failed to fetch or parse ${url}:`, error);
            return [];
        }
    };

    const buildFileTreeRecursively = async (baseUrl, relativePath = '') => {
        const fullUrl = new URL(relativePath, baseUrl).href;
        const links = await fetchAndParseLinks(fullUrl);
        const tree = {};

        for (const link of links) {
            const isDirectory = link.endsWith('/') || !link.includes('.');
            if (isDirectory) { // It's a directory
                // Ensure the link has a trailing slash for the next recursive call
                const dirLink = link.endsWith('/') ? link : `${link}/`;
                const dirName = link.endsWith('/') ? link.slice(0, -1) : link;
                tree[dirName] = await buildFileTreeRecursively(baseUrl, relativePath + dirLink);
            } else { // It's any file (including .zip, .txt, .gif, .capx, etc.)
                tree[link] = {};
            }
        }
        return tree;
    };

    const init = async () => {
        // Apply saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
        }

        // Hide share toggle if not in admin mode
        const urlParamsForAdminCheck = new URLSearchParams(window.location.search);
        if (!urlParamsForAdminCheck.has('admin')) {
            shareControlsWrapper.style.display = 'none';
        }

        console.log('[DEBUG] init function started.'); // Added debug log
        showLoader('Fetching file list...');
        try {
            fileStructure = await buildFileTreeRecursively(API_URL);

            // Check for a banner image and replace the title if found
            const bannerPng = 'banner.png';
            const bannerGif = 'banner.gif';
            let bannerUrl = null;

            if (fileStructure[bannerPng]) {
                bannerUrl = new URL(bannerPng, API_URL).href;
            } else if (fileStructure[bannerGif]) {
                bannerUrl = new URL(bannerGif, API_URL).href;
            }

            if (bannerUrl) {
                const mainTitleElement = document.getElementById('main-title');
                if (mainTitleElement) {
                    mainTitleElement.outerHTML = `<img id="main-title-banner" src="${bannerUrl}" alt="Site Banner">`;
                }
            }

            console.log('[DEBUG] File structure built:', fileStructure); // Added debug log
            renderTree(fileStructure, fileTree);
            console.log('[DEBUG] File tree rendered.'); // Added debug log

            // Check for a zip in the URL to auto-load
            const urlParams = new URLSearchParams(window.location.search);
            const zipToLoad = urlParams.get('zip') || urlParams.get('play');
            const playMode = urlParams.has('play');

            if (zipToLoad) {
                console.log(`[DEBUG] Auto-loading zip from URL: ${zipToLoad}`); // Added debug log
                const elementToClick = fileTree.querySelector(`[data-path="${zipToLoad}"]`);
                if (elementToClick) {
                    if (playMode) {
                        // Wait for the zip to be processed and the play button to be available
                        const observer = new MutationObserver((mutations, obs) => {
                            const playBtn = document.getElementById('play-btn');
                            if (playBtn && playBtn.style.display !== 'none') {
                                playBtn.click();
                                obs.disconnect();
                            }
                        });
                        observer.observe(document.getElementById('preview-actions'), { childList: true, subtree: true, attributes: true });
                    }
                    // Expand parents
                    let parent = elementToClick.closest('li.folder');
                    while(parent) {
                        parent.classList.add('open');
                        parent = parent.parentElement.closest('li.folder');
                    }
                    elementToClick.click();
                } else {
                    console.warn(`[DEBUG] Element for zip "${zipToLoad}" not found in tree.`); // Added debug log
                }
            } else {
                console.log('[DEBUG] No zip specified in URL to auto-load.'); // Added debug log
            }

        } catch (error) {
            console.error('[DEBUG] Failed to initialize:', error); // Added debug log
            fileTree.innerHTML = `<p style="color: #ff8a80;">Error fetching file list: ${error.message}</p>`;
        } finally {
            console.log('[DEBUG] init function finished, hiding loader.'); // Added debug log
            hideLoader();
        }
    };

    init();
});
