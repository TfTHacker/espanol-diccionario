// src/ui/web-view.ts — In-Obsidian web viewer for external reference sites

import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_WEB as VIEW_TYPE_WEB_CONST } from "../constants";

export const VIEW_TYPE_WEB = VIEW_TYPE_WEB_CONST;

/**
 * Minimal type for Electron's webview tag (desktop only).
 * Only used when Platform.isMobile is false.
 */
interface WebviewTag extends HTMLElement {
	src: string;
	canGoBack(): boolean;
	canGoForward(): boolean;
	goBack(): void;
	goForward(): void;
	reload(): void;
}

interface ElectronRequire {
	(module: "electron"): { shell: { openExternal: (url: string) => void } };
}

interface WindowWithRequire extends Window {
	require?: ElectronRequire;
}

export class WebView extends ItemView {
	private url: string = "";
	private titleText: string = "";
	private webviewEl: WebviewTag | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_WEB;
	}

	getDisplayText(): string {
		return this.titleText || "Web View";
	}

	getIcon(): string {
		return "globe";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("ed-web-container");

		if (this.url) {
			this.loadUrl(this.url, this.titleText);
		}
	}

	async onClose() {
		if (this.webviewEl) {
			this.webviewEl.remove();
			this.webviewEl = null;
		}
	}

	/**
	 * Load a URL in the embedded webview
	 */
	loadUrl(url: string, title?: string) {
		this.url = url;
		this.titleText = title || "Web View";

		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// Navigation bar
		const navBar = container.createDiv({ cls: "ed-web-nav" });
		const backBtn = navBar.createEl("button", { cls: "ed-web-nav-btn", attr: { title: "Back" } });
		backBtn.setText("←");
		const forwardBtn = navBar.createEl("button", { cls: "ed-web-nav-btn", attr: { title: "Forward" } });
		forwardBtn.setText("→");
		const refreshBtn = navBar.createEl("button", { cls: "ed-web-nav-btn", attr: { title: "Refresh" } });
		refreshBtn.setText("⟳");
		const urlDisplay = navBar.createDiv({ cls: "ed-web-url", attr: { title: url } });
		urlDisplay.setText(new URL(url).hostname);
		const openExtBtn = navBar.createEl("button", { cls: "ed-web-nav-btn ed-web-open-ext", attr: { title: "Open in browser" } });
		openExtBtn.setText("⤴");

		// Create webview element (Electron-specific, allows cross-origin navigation)
		const webview = document.createElement("webview") as WebviewTag;
		webview.src = url;
		webview.setAttribute("allowpopups", "true");
		webview.addClass("ed-webview");
		container.appendChild(webview);
		this.webviewEl = webview;

		// Navigation handlers
		backBtn.addEventListener("click", () => {
			if (webview.canGoBack()) webview.goBack();
		});
		forwardBtn.addEventListener("click", () => {
			if (webview.canGoForward()) webview.goForward();
		});
		refreshBtn.addEventListener("click", () => {
			webview.reload();
		});
		openExtBtn.addEventListener("click", () => {
			const electronReq = (window as WindowWithRequire).require;
			if (electronReq) {
				electronReq("electron").shell.openExternal(url);
			} else {
				window.open(url, "_blank");
			}
		});

		// Update URL display on navigation
		webview.addEventListener("did-navigate", (evt: Event) => {
			const navEvt = evt as { url?: string };
			try {
				if (navEvt.url) {
					urlDisplay.setText(new URL(navEvt.url).hostname);
					urlDisplay.setAttribute("title", navEvt.url);
				}
			} catch {
				if (navEvt.url) urlDisplay.setText(navEvt.url);
			}
		});
		webview.addEventListener("did-navigate-in-page", (evt: Event) => {
			const navEvt = evt as { url?: string };
			try {
				if (navEvt.url) {
					urlDisplay.setText(new URL(navEvt.url).hostname);
					urlDisplay.setAttribute("title", navEvt.url);
				}
			} catch {
				// ignore
			}
		});

		// Loading indicator
		webview.addEventListener("did-start-loading", () => {
			urlDisplay.addClass("ed-web-loading");
		});
		webview.addEventListener("did-stop-loading", () => {
			urlDisplay.removeClass("ed-web-loading");
		});
	}
}