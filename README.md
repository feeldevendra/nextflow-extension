# NextFlow — Auto-scroll YouTube Shorts Extension

**Author:** Devendra Lodhi  
**Portfolio:** [www.devendra.bio](https://www.devendra.bio)  
**Agency:** Flyboost Media ([www.flyboost.in](https://www.flyboost.in))  
**Contact Emails:** [contact@devendra.bio](mailto:contact@devendra.bio), [contact@flyboost.in](mailto:contact@flyboost.in)

---

## Overview

NextFlow is a Chrome Extension designed to make watching YouTube Shorts smoother and more efficient. It automatically scrolls to the next Short when the current one ends while respecting YouTube’s ad policies. Users can configure delay timing, ad handling, and toggle auto-scroll behavior using a modern popup UI or the Options page.

**Key Principles:**
- Lightweight and local-only.
- Policy-aware: ads are not skipped by default; skip is opt-in.
- Customizable delay and network-aware execution.
- Easy control via popup and options page.

---

## Features

- **Auto-scroll Shorts:** Automatically jump to the next Short after the current one ends.  
- **Delay Control:** Set a custom delay (ms) before moving to the next Short.  
- **Policy-aware Ad Handling:** Pause during unskippable ads by default; opt-in skip for visible skip buttons.  
- **Lightweight & Privacy-focused:** All settings stored locally; no personal data is collected.  
- **Quick Toggles:** Enable/disable auto-scroll instantly from the popup.  
- **Advanced Options:** Export, import, and reset settings from the Options page.  
- **Network Awareness:** Optionally run only on WiFi or fast connections.

---

## Installation

### 1. Load Unpacked (for testing)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the `nextflow-extension` folder.
5. Open any YouTube Shorts page (`https://www.youtube.com/shorts/...`) and the extension will automatically start working.

### 2. Chrome Web Store

- Once published, install NextFlow directly from the [Chrome Web Store](#).  
- Configure via popup or Options page.

---

## Usage

1. Open a YouTube Shorts feed or a single Short.
2. Use the popup to enable/disable **Auto-scroll**.
3. Set **Delay (ms)** in Options to control timing between Shorts.
4. **Skip Ads** option: enable only if you want the extension to click visible skip buttons.
5. All settings are automatically saved locally.

---

## Options Page

- Export Settings → Save JSON backup of your current preferences.  
- Import Settings → Load previously saved settings.  
- Reset Settings → Restore default values.

---

## Screenshots (Preview)

> Replace with your own generated screenshots for Chrome Web Store listing.

1. **Popup UI**: Auto-scroll toggle, skip ads option, delay slider.  
2. **Options Page**: Export, import, reset settings.  
3. **Policy-aware Ad Handling**: Extension pauses during ads, safe default behavior.

---

## Privacy & Security

- **Local-only storage:** All settings are saved using Chrome’s storage API.  
- **No PII collection:** The extension does not collect emails, names, account identifiers, or watch history.  
- **Opt-in skip ads:** Automated skip is only active if explicitly enabled by the user.  
- See [Privacy Policy](https://your-privacy-policy-url.com) for full details.

---

## Contributing

Contributions, feedback, and bug reports are welcome!  
- Open issues on GitHub for bug fixes or suggestions.  
- Fork the repository and submit pull requests.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Contact

**Devendra Lodhi**  
- Portfolio: [www.devendra.bio](https://www.devendra.bio)  
- Email: [contact@devendra.bio](mailto:contact@devendra.bio)  

**Flyboost Media**  
- Website: [www.flyboost.in](https://www.flyboost.in)  
- Email: [contact@flyboost.in](mailto:contact@flyboost.in)  

---

> NextFlow is built with ❤️ by Devendra Lodhi at Flyboost Media.
