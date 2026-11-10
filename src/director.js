export function createDirector() {
  let pending = null;
  let manualTab = false;

  function fireIfIdle(idle, actions) {
    if (!pending || !idle) return;
    if (pending === "video") {
      actions.push("moveVideoToMiddle", "openQueuePanel");
      if (!manualTab) actions.push({ selectTab: "lyrics" });
    } else {
      actions.push("showLyricsInMiddle");
    }
    pending = null;
  }

  function handle(event) {
    const actions = [];
    if (event.type === "track") {
      manualTab = false;
      pending = event.hasVideo ? "video" : "lyrics";
      fireIfIdle(event.idle, actions);
      // History tab is selected after the middle action so action order stays fixed.
      if (!event.hasVideo) actions.push({ selectTab: "history" });
    } else if (event.type === "tick") {
      fireIfIdle(event.idle, actions);
    } else if (event.type === "tabPicked") {
      manualTab = true;
    }
    return actions;
  }

  function state() {
    return { pending, manualTab };
  }

  return { handle, state };
}
