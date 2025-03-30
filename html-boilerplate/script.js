let bluetoothDevice; // <-- MUST be at top level
let characteristics = {};

// --- State Variables ---
let isMuted = false;
let storedVolumeBeforeMute = 50; // Default volume
const feedbackTimeouts = {};

// --- Service & Characteristic UUIDs ---
const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUIDS = {
    volume: '0000ffe1-0000-1000-8000-00805f9b34fb',
    channel: '0000ffe2-0000-1000-8000-00805f9b34fb',
    treble: '0000ffe3-0000-1000-8000-00805f9b34fb',
    bass: '0000ffe4-0000-1000-8000-00805f9b34fb'
};

// --- EQ Presets Definition ---
const EQ_PRESETS = {
    'flat':         { bass: 0,  treble: 0 },
    'rock':         { bass: 4,  treble: 5 },
    'pop':          { bass: 2,  treble: 3 },
    'jazz':         { bass: -2, treble: 4 },
    'bass_boost':   { bass: 8,  treble: -2 },
    'treble_boost': { bass: -2, treble: 6 }
    // Add or modify presets as needed
};

// --- DOM Elements ---
const connectButton = document.getElementById('connect'); // Keep this separate
const statusDisplay = document.getElementById('status');
const volumeInput = document.getElementById('volumeInput');
const volumeValue = document.getElementById('volumeValue');
const trebleInput = document.getElementById('trebleInput');
const trebleValue = document.getElementById('trebleValue');
const bassInput = document.getElementById('bassInput');
const bassValue = document.getElementById('bassValue');
const channelInputs = document.querySelectorAll('input[name="channelInput"]');
const presetButtons = document.querySelectorAll('.btn-preset');
const muteButton = document.getElementById('muteButton');
const darkModeToggle = document.getElementById('darkModeToggle');
const bodyElement = document.body;
let adjustButtons = []; // Will be populated in DOMContentLoaded

// --- All *Audio* Controls Array ---
// REMOVED connectButton from this list
// Populated fully in DOMContentLoaded
const audioControls = [
    // Connect button is managed separately
    volumeInput,
    trebleInput,
    bassInput,
    muteButton,
    ...channelInputs,
    ...presetButtons
    // adjustButtons will be added later
];

// --- Initialize ---
document.addEventListener("DOMContentLoaded", () => {
    // Set default UI state
    document.getElementById("channel1").checked = true;
    volumeInput.value = 50;
    storedVolumeBeforeMute = 50;
    isMuted = false;
    trebleInput.value = 0;
    bassInput.value = 0;
    updateSliderValue('volume');
    updateSliderValue('treble');
    updateSliderValue('bass');
    muteButton.textContent = 'Mute';
    muteButton.classList.remove('muted');

    // Get Adjustment Buttons and add to allControls
    adjustButtons = document.querySelectorAll('.btn-adjust');
    audioControls.push(...adjustButtons); // Add adjust buttons to the list of audio controls

    // Initialize Theme
    initializeTheme();

    // Start with audio controls disabled, connect button enabled
    disableAudioControls();
    connectButton.disabled = false; // Ensure connect is enabled initially

    // Add Event Listeners
    connectButton.addEventListener('click', handleConnectClick); // This listener is correct

    volumeInput.addEventListener("input", () => handleControlChange('volume'));
    trebleInput.addEventListener("input", () => handleControlChange('treble'));
    bassInput.addEventListener("input", () => handleControlChange('bass'));
    channelInputs.forEach(input => {
        input.addEventListener('change', () => handleControlChange('channel'));
    });
    presetButtons.forEach(button => {
        button.addEventListener('click', handlePresetClick);
    });
    adjustButtons.forEach(button => {
        button.addEventListener('click', handleAdjustButtonClick);
    });
    muteButton.addEventListener('click', toggleMute);
    darkModeToggle.addEventListener('click', toggleTheme);
});

// --- Dark Mode Logic ---
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(currentTheme);
}

function applyTheme(theme) {
    if (theme === 'dark') {
        bodyElement.setAttribute('data-theme', 'dark');
        if (darkModeToggle) darkModeToggle.textContent = '☀️'; // Sun icon
    } else {
        bodyElement.removeAttribute('data-theme');
        if (darkModeToggle) darkModeToggle.textContent = '🌙'; // Moon icon
    }
    localStorage.setItem('theme', theme);
    console.log(`Theme applied: ${theme}`);
}

function toggleTheme() {
    const isCurrentlyDark = bodyElement.getAttribute('data-theme') === 'dark';
    const newTheme = isCurrentlyDark ? 'light' : 'dark';
    applyTheme(newTheme);
}

// --- Bluetooth Connection Logic ---
function handleConnectClick() {
    console.log('handleConnectClick triggered.'); // 1. Check if function runs
    console.log('Checking bluetoothDevice:', typeof bluetoothDevice, bluetoothDevice); // 2. Check variable state *before* the 'if'

    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        disconnectDevice();
    } else {
        connectDevice();
    }
}

async function connectDevice() {
    statusDisplay.textContent = 'Status: Connecting...';
    // Manage connect button state *explicitly*
    connectButton.textContent = 'Connecting...';
    connectButton.disabled = true;
    // Disable audio controls
    disableAudioControls();

    try {
        console.log('Attempting to call navigator.bluetooth.requestDevice...');
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SERVICE_UUID] }],
        });
        console.log('navigator.bluetooth.requestDevice call finished.'); 
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
        const server = await bluetoothDevice.gatt.connect();
        console.log('Getting Service...');
        const service = await server.getPrimaryService(SERVICE_UUID);
        console.log('Getting Characteristics...');
        characteristics = {};
        await Promise.all(Object.keys(CHARACTERISTIC_UUIDS).map(async (key) => {
             try {
                 characteristics[key] = await service.getCharacteristic(CHARACTERISTIC_UUIDS[key]);
                 console.log(`Found Characteristic: ${key}`);
             } catch (charError) {
                  console.error(`Characteristic ${key} (${CHARACTERISTIC_UUIDS[key]}) not found!`, charError);
                  throw new Error(`Missing characteristic: ${key}`);
             }
         }));


        // --- Success ---
        statusDisplay.textContent = `Status: Connected to ${bluetoothDevice.name || 'device'}`;
        connectButton.textContent = 'Disconnect';
        connectButton.disabled = false; // Enable connect button
        enableAudioControls();          // Enable audio controls
        console.log('Device connected and characteristics ready.');

    } catch (error) {
        // --- Failure ---
        console.error('Error during connectDevice:', error);
        let errorMsg = /* ... (error message formatting logic is fine) ... */ error.message;
        // Update status display
        statusDisplay.textContent = `Status: ${errorMsg}`;
        // Reset connect button state
        connectButton.textContent = 'Connect';
        connectButton.disabled = false; // Enable connect button for retry
        // Keep audio controls disabled (they already are)
        // disableAudioControls(); // Not strictly needed again, but ensures state

        // Cleanup partial connection
        if (bluetoothDevice) {
            bluetoothDevice.removeEventListener('gattserverdisconnected', onDisconnected);
            if (bluetoothDevice.gatt.connected) {
                bluetoothDevice.gatt.disconnect();
            }
        }
        bluetoothDevice = null;
        characteristics = {};
    }
}

function disconnectDevice() {
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
        onDisconnected(); // Ensure UI reset
        return;
    }
    console.log('Disconnecting from device...');
    statusDisplay.textContent = 'Status: Disconnecting...';
    // Manage connect button state *explicitly*
    connectButton.disabled = true;
    // Optionally disable audio controls immediately, or wait for onDisconnected
    // disableAudioControls();
    bluetoothDevice.gatt.disconnect();
}


function onDisconnected() {
    console.log('Bluetooth device disconnected.');
    statusDisplay.textContent = 'Status: Not connected';
    // Manage connect button state *explicitly*
    connectButton.textContent = 'Connect';
    connectButton.disabled = false; // Enable connect button

    // ... (Reset Mute State is fine) ...

    // Cleanup BLE state
    if (bluetoothDevice) {
         bluetoothDevice.removeEventListener('gattserverdisconnected', onDisconnected);
    }
    bluetoothDevice = null;
    characteristics = {};
    Object.values(feedbackTimeouts).forEach(clearTimeout);
    for (const key in feedbackTimeouts) delete feedbackTimeouts[key];

    // Disable audio controls
    disableAudioControls();
}


// --- Control Handling ---

function updateSliderValue(type) {
    const input = document.getElementById(`${type}Input`);
    const valueSpan = document.getElementById(`${type}Value`);
    if (input && valueSpan) {
        valueSpan.textContent = input.value;
    }
}

async function handlePresetClick(event) {
    const presetName = event.target.dataset.preset;
    const preset = EQ_PRESETS[presetName];
    if (!preset) return;

    console.log(`Applying preset: ${presetName}`, preset);
    bassInput.value = preset.bass;
    updateSliderValue('bass');
    trebleInput.value = preset.treble;
    updateSliderValue('treble');

    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        try {
            await Promise.all([ sendData('bass'), sendData('treble') ]);
            console.log('Preset values sent successfully.');
             showFeedback(event.target); // Feedback on the button itself
        } catch(error) {
            console.error('Error sending preset values.', error);
            statusDisplay.textContent = 'Status: Error applying preset';
        }
    }
}

function handleAdjustButtonClick(event) {
    const button = event.currentTarget;
    const controlType = button.dataset.control;
    const isIncrement = button.classList.contains('btn-increment');
    const slider = document.getElementById(`${controlType}Input`);
    if (!slider) return;

    const currentValue = parseFloat(slider.value);
    const step = parseFloat(slider.step) || 1;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    let newValue = isIncrement ? currentValue + step : currentValue - step;
    newValue = Math.max(min, Math.min(max, newValue)); // Clamp value

    // Handle Mute interaction for Volume
    if (controlType === 'volume') {
        if (isMuted && newValue > 0) { // Unmuting via button
            isMuted = false;
            muteButton.textContent = 'Mute';
            muteButton.classList.remove('muted');
            storedVolumeBeforeMute = newValue;
        } else if (!isMuted && newValue === 0) { // Muting via button to zero
            isMuted = true;
            muteButton.textContent = 'Unmute';
            muteButton.classList.add('muted');
            // Store volume before it hit zero
            storedVolumeBeforeMute = currentValue > 0 ? currentValue : storedVolumeBeforeMute;
             if (storedVolumeBeforeMute == 0) storedVolumeBeforeMute = step; // Ensure restore > 0
        } else if (!isMuted) { // Adjusting volume normally
            storedVolumeBeforeMute = newValue;
        } else if (isMuted && newValue <= 0) { // Already muted at zero
             if (currentValue === 0) return; // Do nothing if already 0
             newValue = 0; // Ensure it stays 0
        }
    }

    slider.value = newValue;
    updateSliderValue(controlType);
    handleControlChange(controlType); // Trigger debounced send
    showFeedback(controlType); // Feedback on the slider thumb
}

function handleControlChange(type) {
    if (type !== 'channel') {
        updateSliderValue(type);
    }

    // Handle Mute interaction for Volume Slider
    if (type === 'volume') {
        const currentVolume = parseInt(volumeInput.value);
        if (isMuted && currentVolume > 0) { // Unmuting via slider
            isMuted = false;
            muteButton.textContent = 'Mute';
            muteButton.classList.remove('muted');
            storedVolumeBeforeMute = currentVolume;
        } else if (!isMuted && currentVolume === 0) { // Muting via slider to zero
             // Try to capture the last non-zero volume before this event
             // Note: Debounce means this might not capture the exact previous value accurately
             if (storedVolumeBeforeMute == 0) storedVolumeBeforeMute = parseInt(volumeInput.step) || 1;
             isMuted = true;
             muteButton.textContent = 'Unmute';
             muteButton.classList.add('muted');
        } else if (!isMuted) { // Adjusting volume normally
            storedVolumeBeforeMute = currentVolume;
        }
    }

    // Debounce sending data
    const characteristicKey = type;
    const char = characteristics[characteristicKey]; // Check if characteristic exists
    if(char){
        clearTimeout(char.debounceTimer);
        char.debounceTimer = setTimeout(() => {
            sendData(type); // Send current value after debounce
        }, 150);
    } else if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        console.warn(`Debounce skipped: Characteristic for ${type} not found.`);
    }
}

async function toggleMute() {
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected || !characteristics.volume) {
        console.warn("Mute toggle ignored: Not connected or volume characteristic missing.");
        return;
    }

    isMuted = !isMuted;
    let valueToSend;

    if (isMuted) {
        console.log('Muting...');
        const currentSliderVol = parseInt(volumeInput.value);
        if (currentSliderVol > 0) {
            storedVolumeBeforeMute = currentSliderVol;
        }
        // Ensure stored volume is never 0 for restore unless it truly was 0.
        if (storedVolumeBeforeMute == 0) storedVolumeBeforeMute = parseInt(volumeInput.step) || 1;

        volumeInput.value = 0;
        valueToSend = 0;
        muteButton.textContent = 'Unmute';
        muteButton.classList.add('muted');
    } else {
        console.log('Unmuting...');
        // Ensure we restore to a non-zero value
        if (storedVolumeBeforeMute == 0) storedVolumeBeforeMute = parseInt(volumeInput.step) || 1;

        volumeInput.value = storedVolumeBeforeMute;
        valueToSend = storedVolumeBeforeMute;
        muteButton.textContent = 'Mute';
        muteButton.classList.remove('muted');
    }

    updateSliderValue('volume');
    await sendData('volume', valueToSend); // Send the specific value immediately
    showFeedback(muteButton); // Feedback on the mute button itself
}


// --- Send Data ---
async function sendData(type, valueToSend = null) {
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
        console.warn(`SendData (${type}): Not connected.`);
        return;
    }
    const characteristic = characteristics[type];
    if (!characteristic) {
        console.error(`SendData (${type}): Characteristic not available.`);
        return;
    }

    let dataValue;
    if (valueToSend !== null) {
        dataValue = String(valueToSend);
    } else {
        // Get value from UI if not provided
        if (type === 'channel') {
            dataValue = document.querySelector('input[name="channelInput"]:checked')?.value ?? '1';
        } else {
            dataValue = document.getElementById(`${type}Input`)?.value ?? '0';
        }
    }

    console.log(`Sending ${type}: ${dataValue}`);
    try {
        const encoder = new TextEncoder();
        await characteristic.writeValueWithResponse(encoder.encode(dataValue));
        console.log(`Successfully sent ${type}: ${dataValue}`);
        // Feedback is usually triggered by the calling function (handleAdjustButtonClick, toggleMute etc.)
        // We could add feedback here *if* it wasn't already triggered.
        // if (valueToSend === null) showFeedback(type); // Example: feedback only if called by debounced handler

    } catch (error) {
        console.error(`Error sending ${type} data (${dataValue}):`, error);
        statusDisplay.textContent = `Status: Error sending ${type}`;
        if (error.name === 'NetworkError' || error.message.includes('disconnected')) {
             console.log("Detected disconnection during sendData.");
             onDisconnected();
        }
    }
}

// --- Visual Feedback ---
function showFeedback(controlIdentifier) {
    let element;
    let isDirectElement = typeof controlIdentifier !== 'string';
    let targetSliderThumb = false;

    if (isDirectElement) {
        element = controlIdentifier; // e.g., muteButton, presetButton
    } else {
        const type = controlIdentifier;
        if (type === 'channel') {
            const checkedRadio = document.querySelector('input[name="channelInput"]:checked');
            element = checkedRadio ? document.querySelector(`label[for="${checkedRadio.id}"]`) : null;
        } else if (['volume', 'treble', 'bass'].includes(type)) {
            element = document.getElementById(`${type}Input`);
            targetSliderThumb = true; // Indicate styling the thumb/slider
        }
    }

    if (!element) return;

    const feedbackClass = 'control-success-glow';
    // Use a unique key for the timeout
    const timeoutKey = element.id || element.getAttribute('for') || element.dataset.preset || `feedback-${Math.random()}`;

    // Clear previous timeout for this element if exists
    if (feedbackTimeouts[timeoutKey]) {
        clearTimeout(feedbackTimeouts[timeoutKey]);
        element.classList.remove(feedbackClass);
        // RAF ensures visual reset before re-adding class quickly
        requestAnimationFrame(() => requestAnimationFrame(() => applyFeedback(element, feedbackClass, timeoutKey)));
    } else {
         applyFeedback(element, feedbackClass, timeoutKey);
    }
}

function applyFeedback(element, feedbackClass, timeoutKey) {
    element.classList.add(feedbackClass);
    feedbackTimeouts[timeoutKey] = setTimeout(() => {
        element.classList.remove(feedbackClass);
        delete feedbackTimeouts[timeoutKey];
    }, 600); // Duration of the glow effect
}

// --- Enable/Disable Controls ---
function disableAllControls(includeConnectButton = true) {
    allControls.forEach(control => {
        // Check if the control is the connect button and if it should be excluded
        if (control === connectButton && !includeConnectButton) {
            // Skip disabling the connect button if specified
        } else {
            control.disabled = true;
        }
    });
     // Also visually dim the labels associated with disabled radio buttons
     document.querySelectorAll('.channel-options label').forEach(label => {
        const inputId = label.getAttribute('for');
        const input = document.getElementById(inputId);
        if (input && input.disabled) {
             label.style.opacity = '0.6';
             label.style.cursor = 'not-allowed';
        }
     });
    console.log("Controls Disabled (Connect Button Included: " + includeConnectButton + ")");
}

function enableAllControls() {
    allControls.forEach(control => control.disabled = false);
     // Restore visual state for labels
     document.querySelectorAll('.channel-options label').forEach(label => {
        label.style.opacity = '1';
        label.style.cursor = 'pointer';
    });
    console.log("Controls Enabled");
}
// Helper function for radio button label visuals
function setRadioLabelsDisabled(isDisabled) {
    document.querySelectorAll('.channel-options label').forEach(label => {
        if (isDisabled) {
            label.style.opacity = '0.6';
            label.style.cursor = 'not-allowed';
        } else {
            label.style.opacity = '1';
            label.style.cursor = 'pointer';
        }
    });
}

// Disables ONLY the audio controls
function disableAudioControls() {
   audioControls.forEach(control => {
       if (control) control.disabled = true; // Check if control exists
   });
   setRadioLabelsDisabled(true); // Update visuals for radio labels
   console.log("Audio Controls Disabled");
}

// Enables ONLY the audio controls
function enableAudioControls() {
   audioControls.forEach(control => {
       if (control) control.disabled = false; // Check if control exists
   });
    setRadioLabelsDisabled(false); // Update visuals for radio labels
   console.log("Audio Controls Enabled");
}