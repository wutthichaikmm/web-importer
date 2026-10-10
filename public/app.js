import { initFileTools } from "./file-tools.js";
import { initImporter } from "./importer.js";

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];

  const selectTab = (selected, { focus = false } = {}) => {
    tabs.forEach((tab) => {
      const isSelected = tab === selected;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !isSelected;
    });
    if (focus) selected.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      selectTab(tabs[(index + step + tabs.length) % tabs.length], { focus: true });
    });
  });
}

initTabs();
initImporter();
initFileTools();
