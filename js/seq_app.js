async function setup() {
  const patchExportURL = "export/patch.export.json";

  // Create AudioContext
  const WAContext = window.AudioContext || window.webkitAudioContext;
  const context = new WAContext();

  // Create gain node and connect it to audio output
  const outputNode = context.createGain();
  outputNode.connect(context.destination);

  // Fetch the exported patcher
  let response, patcher;
  try {
    response = await fetch(patchExportURL);
    patcher = await response.json();

    if (!window.RNBO) {
      // Load RNBO script dynamically
      // Note that you can skip this by knowing the RNBO version of your patch
      // beforehand and just include it using a <script> tag
      await loadRNBOScript(patcher.desc.meta.rnboversion);
    }
  } catch (err) {
    const errorContext = {
      error: err,
    };
    if (response && (response.status >= 300 || response.status < 200)) {
      (errorContext.header = `Couldn't load patcher export bundle`),
        (errorContext.description =
          `Check app.js to see what file it's trying to load. Currently it's` +
          ` trying to load "${patchExportURL}". If that doesn't` +
          ` match the name of the file you exported from RNBO, modify` +
          ` patchExportURL in app.js.`);
    }
    if (typeof guardrails === "function") {
      guardrails(errorContext);
    } else {
      throw err;
    }
    return;
  }

  // Create the device
  let device;
  try {
    device = await RNBO.createDevice({ context, patcher });
  } catch (err) {
    if (typeof guardrails === "function") {
      guardrails({ error: err });
    } else {
      throw err;
    }
    console.log("Error creating device");
    return;
  }

  // Connect the device to the web audio graph
  device.node.connect(outputNode);

  // (Optional) Attach listeners to outports so you can log messages from the RNBO patcher
  attachOutports(device);

  // (NICK ADDED) Get inports and parameters for debugging
  const inports = getInports(device);
  console.log("Inports:");
  console.log(inports);
  const parameters = getParameters(device);
  console.log("Parameters");
  parameters.forEach((param) => {
    console.log(param);
  });

  setupStartStop(device);
  setupMelodySliders(device);
  setupRhythmSliders(device);
  setupVolumeSliders(device);

  setupTempo(device);

  // (NICK ADDED) Resume the audio context on user interaction
  document.body.onclick = () => {
    if (context.state === "running") return;
    context.resume();
    console.log("Audio context resumed");
  };

  // Skip if you're not using guardrails.js
  if (typeof guardrails === "function") guardrails();

  console.log("Patcher loaded successfully?");
  console.log(context);
}

function loadRNBOScript(version) {
  return new Promise((resolve, reject) => {
    if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
      throw new Error(
        "Patcher exported with a Debug Version!\nPlease specify the correct RNBO version to use in the code."
      );
    }
    const el = document.createElement("script");
    el.src =
      "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" +
      encodeURIComponent(version) +
      "/rnbo.min.js";
    el.onload = resolve;
    el.onerror = function (err) {
      console.log(err);
      reject(new Error("Failed to load rnbo.js v" + version));
    };
    document.body.append(el);
  });
}

// (NICK ADDED)
function setupMelodySliders(device) {
  const melodySliders = [];
  for (let i = 1; i < 9; i++) {
    const melodySlider = document.getElementById(`melody-slider-${i}`);
    melodySliders.push(melodySlider);

    melodySlider.oninput = () => {
      sendMessageToInport(
        device,
        "track_one",
        melodySliders.map((s) => s.value).join(", ")
      );
    };
  }
}

// (NICK ADDED)
function setupRhythmSliders(device) {
  const rhythmSliders = [];
  for (let i = 1; i < 9; i++) {
    const rhythmSlider = document.getElementById(`rhythm-slider-${i}`);
    rhythmSliders.push(rhythmSlider);

    rhythmSlider.oninput = () => {
      sendMessageToInport(
        device,
        "track_two",
        rhythmSliders.map((s) => s.value).join(", ")
      );
    };
  }
}

// (NICK ADDED)
function setupTempo(device) {
  const tempoText = document.getElementById("tempo-text");
  const tempoState = getParameter(device, "tempo");
  tempoText.value = tempoState.value;

  tempoText.onchange = () => {
    if (isNaN(tempoText.value) || tempoText.value < 0) {
      tempoText.value = tempoState.value;
    }
    if (tempoText.value > tempoState.max) {
      tempoText.value = tempoState.max;
    }
    if (tempoText.value < tempoState.min) {
      tempoText.value = tempoState.min;
    }

    // sendMessageToInport(device, "tempo", tempoText.value);
    // OR
    tempoState.value = tempoText.value;
  };
}

// (NICK ADDED)
function setupStartStop(device) {
  const tempoToggle = document.getElementById("tempo-toggle");
  tempoToggle.onclick = () => {
    const messageEvent = new RNBO.MessageEvent(
      RNBO.TimeNow,
      "transport_toggle",
      tempoToggle.checked ? [1] : [0]
    );
    device.scheduleEvent(messageEvent);
    //OR
    // sendMessageToInport(device, "transport_toggle", tempoToggle.checked ? "1" : "0");
  };
  const toggleState = getParameter(device, "transport_toggle");
  tempoToggle.checked = toggleState.value === 1;
}

// (NICK ADDED)
function setupVolumeSliders(device) {
  const melodyVolumeSlider = document.getElementById("melody-volume");
  const melodyVolumeValue = document.getElementsByClassName("volume-text")[0];
  melodyVolumeSlider.value = 1;
  melodyVolumeValue.innerHTML = 100;

  melodyVolumeSlider.oninput = function () {
    melodyVolumeValue.innerHTML = Math.round(this.value * 1000) / 10;
    // sendMessageToInport(
    //   device,
    //   "track_one_volume",
    //   (this.value * 100).toString()
    // );
    // OR
    const trackOneVolumeParam = getParameter(device, "track_one_volume");
    trackOneVolumeParam.value = this.value * 240;
  };

  const rhythmVolumeSlider = document.getElementById("rhythm-volume");
  const rhythmVolumeValue = document.getElementsByClassName("volume-text")[1];
  rhythmVolumeSlider.value = 1;
  rhythmVolumeValue.innerHTML = 100;

  rhythmVolumeSlider.oninput = function () {
    rhythmVolumeValue.innerHTML = Math.round(this.value * 1000) / 10;
    // sendMessageToInport(
    //   device,
    //   "track_two_volume",
    //   (this.value * 100).toString()
    // );
    // OR
    const trackTwoVolumeParam = getParameter(device, "track_two_volume");
    trackTwoVolumeParam.value = this.value * 240;
  };
}

// helper functions
function getInports(device) {
  const messages = device.messages;
  const inports = messages.filter(
    (message) => message.type === RNBO.MessagePortType.Inport
  );
  return inports;
}

function getParameters(device) {
  const parameters = device.parameters;
  return parameters;
}

function getParameter(device, parameterName) {
  const parameters = device.parameters;
  const parameter = parameters.find((param) => param.name === parameterName);
  return parameter;
}

function sendMessageToInport(device, inportTag, values) {
  // Turn the text into a list of numbers (RNBO messages must be numbers, not text)
  const messsageValues = values.split(/\s+/).map((s) => parseFloat(s));

  // Send the message event to the RNBO device
  let messageEvent = new RNBO.MessageEvent(
    RNBO.TimeNow,
    inportTag,
    messsageValues
  );
  device.scheduleEvent(messageEvent);
}

function attachOutports(device) {
  const outports = device.outports;
  if (outports.length < 1) {
    document
      .getElementById("rnbo-console")
      .removeChild(document.getElementById("rnbo-console-div"));
    return;
  }

  document
    .getElementById("rnbo-console")
    .removeChild(document.getElementById("no-outports-label"));
  device.messageEvent.subscribe((ev) => {
    // Ignore message events that don't belong to an outport
    if (outports.findIndex((elt) => elt.tag === ev.tag) < 0) return;

    // Message events have a tag as well as a payload
    console.log(`${ev.tag}: ${ev.payload}`);

    document.getElementById(
      "rnbo-console-readout"
    ).innerText = `${ev.tag}: ${ev.payload}`;
  });
}

setup();
