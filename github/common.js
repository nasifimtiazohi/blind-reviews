"use strict";

function parsePR(url) {
  const re = /^(https:\/\/github.com)?\/([\w-]+\/[\w-]+\/(pull|issues)\/\d+)/;
  const match = url.match(re);
  return match && match[2];
}

function storage(pr, visible) {
  if (!pr) {
    pr = parsePR(location.href);
  }
  return new Promise(resolve => {
    if (visible != null) {
      return chrome.storage.sync.set({[pr]: +visible}, resolve);
    }
    chrome.storage.sync.get(pr, result => resolve(result[pr]));
  });
}

const observer = {
  listeners: new Map(),

  observe(mutations) {
    // Multiple events get coalesced when inserting nested nodes,
    // using a Set ensures we run the listener once per matched node.

    for (const [selector, listener] of observer.listeners) {
      const matched = new Set();

      for (const record of mutations) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            node.querySelectorAll(selector).forEach(m => matched.add(m));
          }
        }
      }
      matched.forEach(listener);
    }
  },

  on(selector, listener) {
    if (!this.observer) {
      this.observer = new MutationObserver(this.observe);
      this.observer.observe(document, {childList: true, subtree: true});
    }

    this.listeners.set(selector, listener);
    document.querySelectorAll(selector).forEach(listener);
  },
};

async function listing(svg) {
  const li = svg.closest("li");
  const href = li.querySelector(`a[href*="/pull/"`).getAttribute("href");

  let visible = await storage(parsePR(href));
  if (visible == null) {
    const author = li.querySelector("span.opened-by > a");
    const user = document.querySelector("li.header-nav-current-user strong");

    visible = user.textContent === author.textContent;
  }

  li.classList.toggle("br-blind", !visible);
}

observer.on("li.js-notification svg.octicon-git-pull-request", listing);
observer.on("li.js-issue-row svg.octicon-git-pull-request", listing);

function submitReview() {
  const flag = document.getElementById("br-flag");
  const text = document.getElementById("pull_request_review_body");
  if (flag instanceof HTMLInputElement && text instanceof HTMLTextAreaElement && flag.checked) {
    text.value += `\n\n[![blind-review](https://github.com/blindreviews3.png)]` +
      `(https://github.com/zombie/blind-reviews "Review performed in blind mode")`;
  }
}

async function addFlag(textarea) {
  const button = textarea.closest("form").querySelector("button");
  button.insertAdjacentHTML("beforebegin", `
    <label style="float: left; margin: 1ex">
      <input id="br-flag" type="checkbox">
      Add blind review flag
    </label>
  `);
  if (!await storage()) {
    // @ts-ignore
    document.getElementById("br-flag").checked = true; 
  }
  button.addEventListener("click", submitReview);
}

observer.on("#submit-review #pull_request_review_body", addFlag);

function augment(a) {
  if (a.classList.contains("br-author")) {
    return;
  }
  const author = document.querySelector("a.author");
  const who = a.getAttribute("href") || a.getAttribute("alt") || a.textContent;
  const role = document.querySelector("span.timeline-comment-label");
  const smallImg=document.querySelector("img.avatar");
  const smallName=document.querySelector("span.author");
  const reviewer=document.querySelector("span.css-truncate-target");

  if (author || who.endsWith(author.textContent.trim())|| 
      role || smallImg || smallName || reviewer) {
    const redacted = document.createElement("span");
    a.parentNode.insertBefore(redacted, a);
    redacted.className = "br-redacted";

    a.classList.add("br-author");
    if (a.tagName === "IMG" || a.querySelector("img")) {
      redacted.className = "br-avatar";
    }
  }
}

const control = `<div id="br-toggle" class="dropdown js-menu-container">
  <span  class="js-menu-target btn-link">
    <button class="btn-link tooltipped tooltipped-n" aria-label="Blind Reviews"></button>
    <span class="dropdown-caret"></span>
  </span>

  <div class="dropdown-menu-content anim-scale-in js-menu-content">
    <div class="dropdown-menu dropdown-menu-se">
      <button class="br-toggle dropdown-item dropdown-signout">PR author</button>
    </div>
  </div>
</div>`;

observer.on("div.timeline-comment-header a.author", augment);
observer.on("div.discussion-item a.author", augment);
observer.on("div.avatar-parent-child > a", augment);
observer.on("div.commit-avatar > a", augment);
observer.on("div.commit .AvatarStack a.avatar", augment);

observer.on("h3.discussion-item-header > img.avatar", augment);

observer.on("div.participation-avatars > a.participant-avatar", augment);
observer.on("div.commit-meta a.commit-author", augment);
observer.on("div.commit-meta .AvatarStack a.avatar", augment);

observer.on("div.flash > div > a.text-emphasized", augment);
observer.on("div.gh-header-meta span.head-ref > span.user", augment);

async function toggle(e) {
  if (e.target.classList.contains("br-toggle")) {
    const visible = !document.body.classList.toggle("br-blinded");
    await storage(null, visible);

    const flag = document.getElementById("br-flag");
    if (flag instanceof HTMLInputElement && flag.checked) {
      flag.checked = false;
    }

    document.body.dispatchEvent(new Event("click", {bubbles: true}));
  }
}

// Logic to determine if a pull request should be blinded by default.
function shouldBlind(author) {
  //blinding every PR page for our purpose
  return true;
  const user = document.querySelector("li.header-nav-current-user strong");

  // Ignore user's own pull requests.
  if (user.textContent === author) {
    return false;
  }

  const open = document.querySelector("div.gh-header div.State--green");

  // Merged and closed PRs are automatically revealed.
  if (!open) {
    return false;
  }

  const reviews = document.querySelectorAll("div.is-approved a.author");

  // Also, once the user has approved a PR, reveal it.
  for (const a of reviews) {
    if (user.textContent === a.textContent) {
      return false;
    }
  }

  // Blind everything else by default.
  return true;
}

async function prHeader(a) {
  if (a.classList.contains("br-author")) {
    return;
  }

  const parent = a.parentElement.previousElementSibling;
  parent.insertAdjacentHTML("beforeend", control);

  let visible = await storage();
  if (visible == null) {
    visible = !shouldBlind(a.textContent.trim());
  }
  document.body.classList.toggle("br-blinded", !visible);

  augment(a);
}
observer.on("a.author",augment);
observer.on("a.author", prHeader);

observer.on("span.timeline-comment-label",augment);
observer.on("img.avatar",augment);
observer.on("span.author",augment)
observer.on("span.css-truncate-target",augment)

document.documentElement.addEventListener("click", toggle);

// Clear debris from buggy PR url parsing.
chrome.storage.sync.remove("null");
