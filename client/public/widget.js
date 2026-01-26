/**
 * CalendAI Embeddable Booking Widget
 * Version: 1.0.0
 *
 * Embed a CalendAI booking page on any website with a single div and script tag.
 *
 * Usage:
 *   <!-- CalendAI Booking Widget -->
 *   <div data-calendai-slug="discovery-call"></div>
 *   <script src="https://your-domain.com/widget.js" async></script>
 *
 * Configuration (data attributes on the container div):
 *   data-calendai-slug   (required) - The event type slug
 *   data-calendai-theme  (optional) - "light" or "dark" (default: none, inherits app default)
 *   data-calendai-width  (optional) - Max width of the widget, e.g. "600px" (default: "100%")
 *   data-calendai-height (optional) - Initial height of the widget (default: "700px")
 *
 * Events:
 *   The widget dispatches a CustomEvent "calendai:booking-confirmed" on the container
 *   div when a booking is successfully completed. Listen for it like so:
 *
 *     document.querySelector('[data-calendai-slug]')
 *       .addEventListener('calendai:booking-confirmed', function(e) {
 *         console.log('Booking confirmed!', e.detail);
 *       });
 */
(function () {
  "use strict";

  // Prevent double-initialization
  if (window.__calendai_widget_loaded) return;
  window.__calendai_widget_loaded = true;

  var ORIGIN = getScriptOrigin();
  var IFRAME_MAP = {};
  var COUNTER = 0;

  /**
   * Determine the CalendAI origin from the script src attribute.
   * Falls back to the current page origin for same-origin setups.
   */
  function getScriptOrigin() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || "";
        if (src.indexOf("widget.js") !== -1) {
          var url = new URL(src);
          return url.origin;
        }
      }
    } catch (e) {
      // ignore
    }
    return window.location.origin;
  }

  /**
   * Initialize a single widget container element.
   */
  function initWidget(el) {
    // Skip if already initialized
    if (el.getAttribute("data-calendai-initialized")) return;
    el.setAttribute("data-calendai-initialized", "true");

    var slug = el.getAttribute("data-calendai-slug");
    if (!slug) return;

    var theme = el.getAttribute("data-calendai-theme") || "";
    var maxWidth = el.getAttribute("data-calendai-width") || "100%";
    var initialHeight = el.getAttribute("data-calendai-height") || "700px";

    // Build iframe URL
    var iframeSrc = ORIGIN + "/book/" + encodeURIComponent(slug);
    var params = [];
    if (theme === "light" || theme === "dark") {
      params.push("theme=" + theme);
    }
    params.push("embed=true");
    if (params.length > 0) {
      iframeSrc += "?" + params.join("&");
    }

    // Create a unique ID for this iframe
    var frameId = "calendai-frame-" + (++COUNTER);

    // Build wrapper
    var wrapper = document.createElement("div");
    wrapper.style.cssText =
      "width:100%;max-width:" +
      maxWidth +
      ";margin:0 auto;overflow:hidden;border-radius:8px;background:transparent;";

    // Build iframe
    var iframe = document.createElement("iframe");
    iframe.id = frameId;
    iframe.src = iframeSrc;
    iframe.style.cssText =
      "width:100%;height:" +
      initialHeight +
      ";border:none;display:block;overflow:hidden;background:transparent;";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("title", "CalendAI Booking - " + slug);

    // Store the mapping from iframe to container element
    IFRAME_MAP[frameId] = { el: el, iframe: iframe };

    wrapper.appendChild(iframe);
    el.appendChild(wrapper);
  }

  /**
   * Listen for postMessage events from embedded iframes.
   */
  function handleMessage(event) {
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.source !== "calendai") return;

    // Find the matching iframe
    var entry = null;
    for (var id in IFRAME_MAP) {
      if (
        IFRAME_MAP[id].iframe.contentWindow === event.source
      ) {
        entry = IFRAME_MAP[id];
        break;
      }
    }
    if (!entry) return;

    switch (data.type) {
      case "calendai:resize":
        if (data.height && typeof data.height === "number" && data.height > 0) {
          entry.iframe.style.height = data.height + "px";
        }
        break;

      case "calendai:booking-confirmed":
        // Dispatch a CustomEvent on the container element so host pages can listen
        var confirmEvent;
        try {
          confirmEvent = new CustomEvent("calendai:booking-confirmed", {
            bubbles: true,
            detail: data.booking || {},
          });
        } catch (e) {
          // IE fallback
          confirmEvent = document.createEvent("CustomEvent");
          confirmEvent.initCustomEvent(
            "calendai:booking-confirmed",
            true,
            false,
            data.booking || {}
          );
        }
        entry.el.dispatchEvent(confirmEvent);
        break;
    }
  }

  /**
   * Scan the DOM for widget containers and initialize them.
   */
  function scan() {
    var elements = document.querySelectorAll("[data-calendai-slug]");
    for (var i = 0; i < elements.length; i++) {
      initWidget(elements[i]);
    }
  }

  // Set up the postMessage listener
  window.addEventListener("message", handleMessage, false);

  // Initialize on DOM ready
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    scan();
  } else {
    document.addEventListener("DOMContentLoaded", scan);
  }

  // Also observe for dynamically added elements (SPA support)
  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          // Check if the added node itself is a widget container
          if (node.getAttribute && node.getAttribute("data-calendai-slug")) {
            initWidget(node);
          }
          // Check descendant nodes
          if (node.querySelectorAll) {
            var descendants = node.querySelectorAll("[data-calendai-slug]");
            for (var k = 0; k < descendants.length; k++) {
              initWidget(descendants[k]);
            }
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
