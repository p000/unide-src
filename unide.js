// UniDe Universal Designer for components
import { exportToAngular } from "./export/angular";
import { exportToLitElement } from "./export/lit";
import { exportToFlow } from "./export/flow";
import { exportToPreact } from "./export/preact";
import { exportToReact } from "./export/react";
import { exportToRaw } from "./export/raw";
import { exportToSvelte } from "./export/svelte";
import { exportToVanilla } from "./export/vanilla";
import { exportToVoK } from "./export/vok";
import { exportToVue } from "./export/vue";
import { paletteContent } from "./curated_header.js";
import { checkModel } from "./check-model";
import { demoDesigns } from "./demo_designs";
const initialDesign = `div
  (
    style
    width: 100%; height: 100%;
    =
  )`;

let currentDesign = [];
let selectedElement;
let storedDesigns = {};

// DnD Stuff
const markerEl = document.createElement("div");
let previousBegin, previousEnd;

// Positions for DnD
const POSITION_BEFORE_ELEMENT = -1;
const POSITION_CHILD_OF_ELEMENT = 0;
const POSITION_AFTER_ELEMENT = 1;

// Design stack for undo/redo
let designStack = [];
let redoStack = [];

let textEditor;

// Finds the first parenthesis starting from index which is not matched.
// That paren marks the end of the component
const findDanglingParen = (arr, index) => {
  let i = index;
  let parenCount = 0;
  do {
    if (i >= arr.length) {
      throw "Ran out of array while dangling" + JSON.stringify(currentDesign);
    }
    switch (arr[i].trim()) {
      case "(":
        parenCount++;
        break;
      case ")":
        parenCount--;
        break;
      default:
        break;
    }
    i++;
  } while (parenCount >= 0);
  return i - 1;
};

const getPaperElement = () => {
  let el = document.getElementById("paper");
  return el;
};

const getOutlineElement = () => {
  return document.getElementById("outline");
};

const showCurrentDesign = () => {
  checkModel(currentDesign.tree);
  let paper = getPaperElement();
  paper.innerHTML = "";
  let style = document.createElement("style");
  style.textContent = currentDesign.css; //textEditor.getValue();
  paper.appendChild(style);
  modelToDOM(currentDesign.tree, paper);
  let outline = getOutlineElement();
  outline.innerHTML = "";
  modelToOutline(currentDesign.tree, outline);
};

const startDrag = (event, snippet) => {
  event.dataTransfer.setData("text", JSON.stringify(snippet));
  previousBegin = previousEnd = -1;
};

const showNewDesign = newDesign => {
  designStack.push(currentDesign);
  currentDesign = newDesign;
  showCurrentDesign();
};

const startDragFromModel = (elementId, event) => {
  let newDesign = currentDesign.slice();
  previousBegin = elementId - 1;
  previousEnd = findDanglingParen(currentDesign, elementId + 1);
  let elementTree = newDesign.splice(
    previousBegin,
    previousEnd - elementId + 2
  );
  designStack.push(currentDesign);
  currentDesign = newDesign;
  event.dataTransfer.setData("text", JSON.stringify(elementTree));
  event.stopPropagation();
};

/**
 * Determines where on the target the current coordinates lie. Either
 * they are before the element, on the element or after the
 * element.
 *
 * @param {*} el
 * @param {*} clientX
 * @param {*} clientY
 */
const getPositionOnTarget = (el, clientX, clientY) => {
  let bcr = el.getBoundingClientRect();
  let radius = Math.min(bcr.right - bcr.left, bcr.bottom - bcr.top) / 2;
  let midX = (bcr.left + bcr.right) / 2;
  let midY = (bcr.top + bcr.bottom) / 2;
  if (
    Math.sqrt(
      (midX - clientX) * (midX - clientX) + (midY - clientY) * (midY - clientY)
    ) <= radius
  ) {
    return POSITION_CHILD_OF_ELEMENT;
  } else if (clientY < midY) {
    return POSITION_BEFORE_ELEMENT;
  } else {
    return POSITION_AFTER_ELEMENT;
  }
};

const placeMarker = e => {
  let marker = document.getElementById("marker");
  marker.style.display = "none";
  let target = document.elementFromPoint(e.clientX, e.clientY);
  let designId = target ? target.getAttribute("data-design-id") : null;
  if (target && designId) {
    let bcr = target.getBoundingClientRect();
    marker.style.display = "block";
    marker.style.top = bcr.top + "px";
    marker.style.left = bcr.left + "px";
    marker.style.width = bcr.width + "px";
    marker.style.height = bcr.height + "px";
    let position = getPositionOnTarget(target, e.clientX, e.clientY);
    switch (position) {
      case POSITION_CHILD_OF_ELEMENT:
        marker.style.border = "1px red solid";
        break;
      case POSITION_BEFORE_ELEMENT:
        marker.style.border = "none";
        marker.style.borderTop = "1px red solid";
        break;
      case POSITION_AFTER_ELEMENT:
        marker.style.border = "none";
        marker.style.borderBottom = "1px red solid";
        break;
      default:
        break;
    }
    e.preventDefault();
    e.stopPropagation();
  } else {
    marker.style.display = "none";
  }
};

let dropElement = e => {
  // Hide marker
  let marker = document.getElementById("marker");
  marker.style.display = "none";
  let target = document.elementFromPoint(e.clientX, e.clientY);
  let index = Number(target.getAttribute("data-design-id"));
  if (index >= previousBegin && index <= previousEnd) {
    // Do not allow dropping on itself
    return;
  }
  if (index > previousEnd) {
    // Adjust for removed content
    index -= previousEnd - previousBegin;
  }
  let position = getPositionOnTarget(target, e.clientX, e.clientY);
  let spliceIndex = findDanglingParen(currentDesign, index + 1);
  if (position === POSITION_AFTER_ELEMENT) {
    spliceIndex = findDanglingParen(currentDesign, index + 1) + 1;
  } else if (position === POSITION_BEFORE_ELEMENT) {
    spliceIndex = index - 1;
  }

  let elementTree = JSON.parse(e.dataTransfer.getData("text"));
  let left = currentDesign.slice(0, spliceIndex);
  let right = currentDesign.slice(spliceIndex, currentDesign.length);
  let newDesign = left.concat(elementTree).concat(right);
  designStack.push(currentDesign);
  currentDesign = newDesign;
  showCurrentDesign();
  e.preventDefault();
};

/**
 * Selects the clicked element and displays its attributes in the
 * attribute panel.
 *
 * @param {*} e
 */
let selectElement = e => {
  let target = document.elementFromPoint(e.clientX, e.clientY);
  let designId = target.getAttribute("data-design-id");
  if (designId) {
    selectedElement = Number(designId);
    // Mini interpreter for extracting property values
    let stack = [];
    let props = "";
    let ip = Number(designId) + 1;
    let value = currentDesign[ip].trim();
    while (value !== "(" && value !== ")" && ip < currentDesign.length) {
      if (value === "=") {
        let tos = stack.pop();
        let nos = stack.pop();
        props = props + `${nos}\t${tos}\n`;
      } else {
        stack.push(value);
      }
      ip++;
      value = currentDesign[ip].trim();
    }
    document.getElementById("attributes").value = props;
    e.preventDefault();
    e.stopPropagation();
  }
};

/**
 * Updates the attributes of the selected element by removing
 * the previous ones and replacing them with new attributes.
 */
const updateAttributes = () => {
  let attributeString = document.getElementById("attributes").value;
  let attributesAsStrings = attributeString.split("\n");
  let attributes = [];
  for (let i in attributesAsStrings) {
    let str = attributesAsStrings[i].trim();
    if (str !== "") {
      let index = str.indexOf("\t");
      if (index === -1) {
        index = str.indexOf(" ");
      }
      let key = str.substring(0, index);
      let value = str.substring(index);
      attributes.push(key);
      attributes.push(value);
      attributes.push("=");
    }
  }
  // Find range of previous attributes
  let index = selectedElement + 1;
  do {
    let a = currentDesign[index].trim();
    if (a === "(") {
      index--;
      break;
    }
    if (a === ")") {
      break;
    }
    index++;
  } while (index < currentDesign.length);

  // Stick the attributes where the old ones were
  let first = currentDesign.slice(0, selectedElement + 1);
  let rest = currentDesign.slice(index, currentDesign.length);
  let newDesign = first.concat(attributes).concat(rest);
  designStack.push(currentDesign);
  currentDesign = newDesign;
  showCurrentDesign();
};

const navigateTo = event => {
  let targetRoute = event.target.getAttribute("targetroute");
  if (targetRoute) {
    loadDesign(targetRoute);
  }
};

/**
 * Creates an interpreter for the Attribute Tree Intermediate Representation
 * that is the UniDe model. The provided functions (in string form) each
 * handle one of the three words in ATIR: ()=
 *
 * @param {*} lparenfnStr
 * @param {*} rparenfnStr
 * @param {*} eqfnStr
 * @param {*} valuefnStr
 */
const makeATIRInterpreter = (lparenfnStr, rparenfnStr, eqfnStr, valuefnStr) => {
  let stack = [];
  let tree = [];
  let current;
  let lparenfn = eval(lparenfnStr);
  let rparenfn = eval(rparenfnStr);
  let eqfn = eval(eqfnStr);
  let valuefn = eval(valuefnStr);
  return (code, target, inert = false) => {
    current = target;
    code.forEach((str, index) => {
      let trimmed = str.trim();
      switch (trimmed) {
        case "(":
          lparenfn(index, inert);
          break;
        case ")":
          rparenfn();
          break;
        case "=":
          eqfn();
          break;
        default:
          valuefn(trimmed);
      }
    });
    return current;
  };
};

const modelToDOM = makeATIRInterpreter(
  `(index, inert) => {
    let old = current;
    tree.push(current);
    let tag = stack.pop();
    if (tag in storedDesigns) {
      current = document.createElement('div');
      modelToDOM(storedDesigns[tag], current,true);
    } else {
      current = document.createElement(tag);
    }
    if (!inert) {
      current.setAttribute('data-design-id', index);
      current.ondragstart = (event) => {startDragFromModel(index, event)};
      current.ondblclick = (event) => {navigateTo(event)}
      current.draggable = true;
    }
    old.appendChild(current);
  }`,
  "() => {current = tree.pop()}",
  `
  () => {
    let tos=stack.pop();
    let nos=stack.pop();
    if (nos in current) {
      try {
        let json = JSON.parse(tos);
        current[nos]=json;
      } catch (e) {
        console.log('Could not parse json ' + e);
        current[nos]=tos;
        current.setAttribute(nos, tos);
      }
    } else {
      current.setAttribute(nos, tos);
    }
  }
  `,
  "str => {stack.push(str)}"
);

const modelToOutline = makeATIRInterpreter(
  `(index, inert) => {
      let old = current;
      tree.push(current);
      current = document.createElement('div');
      current.textContent=stack.pop();
      current.setAttribute('data-design-id', index);
      current.ondragstart = (event) => {startDragFromModel(index, event)};
      current.draggable = true;
      old.appendChild(current);
    }`,
  "() => {current = tree.pop()}",
  "() => {}",
  "str => {stack.push(str)}"
);

/**
 * Creates a section in the palette. Features a title of
 * the section and contents that appears on hover.
 * @param {string} name
 * @param {*} tags
 * @param {*} palette
 */
const createPaletteSection = (name, tags, palette) => {
  let outer = document.createElement("div");
  outer.className = "palette-section";
  outer.innerHTML = name;
  outer.onmouseover = event => {
    outer.style.height = 8 + tags.length + "rem";
  };
  outer.onmouseout = event => {
    outer.style.height = null;
  };
  palette.appendChild(outer);
  for (let i in tags) {
    let tagAndSnippet = tags[i];
    let el = document.createElement("div");
    const snippet = tagAndSnippet[1];
    if (snippet) {
      el.draggable = true;
      el.ondragstart = event => {
        const preview = document.getElementById("element-preview");
        preview.style.display = "none";
        startDrag(event, snippet);
      };

      el.onmouseover = event => {
        const preview = document.getElementById("element-preview");
        preview.style.top = event.clientY + "px";
        preview.style.left = event.clientX + 200 + "px";
        preview.innerHTML = "";
        modelToDOM(snippet, preview);
        preview.style.display = "block";
      };
      el.onmouseout = event => {
        const preview = document.getElementById("element-preview");
        preview.style.display = "none";
      };
    }
    el.innerHTML = tagAndSnippet[0];
    outer.appendChild(el);
  }
};

/**
 * Collects designs stored in local storage for inclusion
 * in the palette.
 */
const getStoredDesignsForPalette = () => {
  let designs = JSON.parse(window.localStorage.getItem("designs") || "{}");
  let parsedDesigns = [];
  let keys = Object.keys(designs);
  keys.forEach(key => {
    parsedDesigns.push(["#" + key, [key, "(", ")"]]);
    parsedDesigns.push([key, designs[key]]);
  });
  return parsedDesigns;
};

/**
 * Fills the palette from a curated set of elements and snippets.
 * Also adds a section containing existing designs to be used
 * as components or expanded into the current design.
 */
const populatePalette = () => {
  let palette = document.getElementById("palette");
  palette.innerHTML = "";
  createPaletteSection(
    "<h2>Designs</h2>",
    getStoredDesignsForPalette(),
    palette
  );
  for (let j in paletteContent) {
    let section = paletteContent[j];
    createPaletteSection(section[0], section[1], palette);
  }
};

/**
 * Populates the design selector with the designs found
 * in local storage.
 */
const populateDesignSelector = () => {
  let selector = document.getElementById("choose-design");
  selector.innerHTML = "";
  let keys = Object.keys(storedDesigns.designs);
  let placeholder = document.createElement("option");
  placeholder.textContent = "Select a design";
  selector.add(placeholder);
  for (let i in keys) {
    let el = document.createElement("option");
    el.textContent = keys[i];
    el.setAttribute("value", keys[i]);
    selector.add(el);
  }
};

/**
 * Saves the current design into local storage.
 *
 * @param {*} event
 */
const saveDesign = event => {
  let designName = document.getElementById("design-name").value;
  storedDesigns[designName] = currentDesign;
  localStorage.setItem("designs", JSON.stringify(storedDesigns));
  populateDesignSelector();
};

/**
 * Pulls the specified design from local storage and uses it as the
 * current design.
 *
 * @param {*} designName
 */
const loadDesign = designName => {
  document.getElementById("design-name").value = designName;
  //  let designs = JSON.parse(window.localStorage.getItem("designs") || "{}");
  currentDesign = storedDesigns.designs[designName];
  designStack = [];
  redoStack = [];
  showCurrentDesign();
};

const loadSelectedDesign = event => {
  loadDesign(document.getElementById("choose-design").value);
};

/**
 * Imports a raw model, that is a plain JSON representation of what is in local storage.
 * @param {*} event
 */
const importRawModel = event => {
  const upload = document.getElementById("import-file-input");
  const file = upload.files[0];
  if (file) {
    const reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = function(evt) {
      localStorage.setItem("designs", evt.target.result);
      populateDesignSelector();
    };
  }
};

/**
 * Calls the appropriate function for exporting the designs currently
 * in local storage based on user selection.
 */
const exportDesign = () => {
  let format = document.getElementById("choose-export-format").value;
  if (format === "LitElement") {
    exportToLitElement(storedDesigns);
  } else if (format === "Angular") {
    exportToAngular(storedDesigns);
  } else if (format === "Flow") {
    exportToFlow(storedDesigns);
  } else if (format === "Preact") {
    exportToPreact(storedDesigns);
  } else if (format === "Raw") {
    exportToRaw(storedDesigns);
  } else if (format === "React") {
    exportToReact(storedDesigns);
  } else if (format === "Svelte") {
    exportToSvelte(storedDesigns);
  } else if (format === "VanillaJS") {
    exportToVanilla(storedDesigns);
  } else if (format === "Vaadin on Kotlin") {
    exportToVoK(storedDesigns);
  } else if (format === "Vue") {
    exportToVue(storedDesigns);
  } else {
    window.alert(`Export to ${format} is not implemented yet, sorry.`);
  }
};

/**
 * Installs handlers for mouse events on various parts of the UI
 */
const installUIEventHandlers = () => {
  let outline = getOutlineElement();
  outline.ondragover = placeMarker;
  outline.onclick = selectElement;
  let paper = getPaperElement();
  paper.ondragover = placeMarker;
  paper.onclick = selectElement;
  let marker = document.getElementById("marker");
  marker.ondrop = dropElement;
  marker.ondragover = placeMarker;
  let attributes = document.getElementById("attributes");
  attributes.onblur = updateAttributes;

  document.getElementById("save-design").onclick = saveDesign;
  document.getElementById("choose-design").onchange = loadSelectedDesign;
  document.getElementById("export-design").onclick = exportDesign;
  document.getElementById("import-file").onclick = importRawModel;

  textEditor.on("change", event => {
    let el = paper.querySelector("style");
    if (el) {
      let css = textEditor.getValue();
      el.textContent = css;
      currentDesign.css = css;
    }
  });
};

const initializeDesign = () => {
  currentDesign = { css: "", tree: initialDesign.split("\n") };
  designStack.push(currentDesign);
};

const installKeyboardHandlers = () => {
  document.body.onkeypress = event => {
    if (event.key === "z" && event.ctrlKey) {
      if (designStack.length > 0) {
        redoStack.push(currentDesign);
        currentDesign = designStack.pop();
        showCurrentDesign();
      }
      event.stopPropagation();
      event.preventDefault();
    }
    if (event.key === "y" && event.ctrlKey) {
      if (redoStack.length > 0) {
        designStack.push(currentDesign);
        currentDesign = redoStack.pop();
        showCurrentDesign();
      }
      event.stopPropagation();
      event.preventDefault();
    }

    if (event.key === "Delete") {
      let newDesign = currentDesign.slice();
      newDesign.splice(
        selectedElement - 1,
        findDanglingParen(newDesign, selectedElement + 1) - selectedElement + 2
      );
      showNewDesign(newDesign);
      event.stopPropagation();
      event.preventDefault();
    }
  };
};

const getStoredDesigns = () => {
  let designsStr = localStorage.getItem("designs") || "{}";
  storedDesigns = JSON.parse(designsStr);
};

const setDemoDesigns = () => {
  if (!localStorage.getItem("designs")) {
    localStorage.setItem("designs", JSON.stringify(demoDesigns));
  }
};

const setupTextEditor = () => {
  textEditor = CodeMirror(document.getElementById("text-editor"), {
    mode: "text/css",
    theme: "tomorrow-night-eighties",
    extraKeys: { "Ctrl-Space": "autocomplete" }
  });
};

const initDesigner = () => {
  setDemoDesigns();
  getStoredDesigns();
  setupTextEditor();
  populatePalette();
  populateDesignSelector();
  initializeDesign();
  installUIEventHandlers();
  installKeyboardHandlers();
  showCurrentDesign();
};

export default initDesigner;
