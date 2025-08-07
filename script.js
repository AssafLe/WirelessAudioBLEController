let bluetoothDevice; // <-- MUST be at top level
let characteristics = {};

// --- State Variables ---
// These globals will now reflect the state of the *current* channel
let isMuted = false;
let storedVolumeBeforeMute = 50; // Default volume for the current channel

// New variables for channel state management
let currentChannel = '1'; // Default starting channel
const channelStates = {}; // Will store { '1': { volume: 50, treble: 0, bass: 0, channelIsMuted: false, channelStoredVolumeBeforeMute: 50 }, ... }
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
    // channelInputs and presetButtons are NodeLists, will spread them in DOMContentLoaded for consistency
    // adjustButtons will be added later
];

// --- Initialize ---
document.addEventListener("DOMContentLoaded", () => {
    // Get Adjustment Buttons and add to audioControls
    adjustButtons = document.querySelectorAll('.btn-adjust');
    audioControls.push(...Array.from(channelInputs), ...Array.from(presetButtons), ...Array.from(adjustButtons)); // Add all dynamically found controls

    // Initialize channelStates for all channels
    channelInputs.forEach(input => {
        const channelId = input.value;
        channelStates[channelId] = {
            volume: 50,
            treble: 0,
            bass: 0,
            channelIsMuted: false, // Per-channel mute state
            channelStoredVolumeBeforeMute: 50 // Per-channel stored volume
        };
    });

    // Set current channel based on default checked radio (assuming channel1 is default)
    currentChannel = document.querySelector('input[name="channelInput"]:checked')?.value || '1';
    // Load UI from channelStates for the initial channel, *after* initializing channelStates
    loadCurrentChannelStateIntoUI();

    // Initialize Theme
    initializeTheme();

    // Start with audio controls disabled, connect button enabled
    disableAudioControls();
    connectButton.disabled = false; // Ensure connect is enabled initially

    // Add Event Listeners
    connectButton.addEventListener('click', handleConnectClick);

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
    console.log('handleConnectClick triggered.');
    console.log('Checking bluetoothDevice:', typeof bluetoothDevice, bluetoothDevice);

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

        // After connection, send the state of the current channel to the device
        // This ensures the device reflects the UI's initial state
        await sendData('channel'); // Send current channel
        await sendData('volume');  // Send current volume for this channel
        await sendData('treble');  // Send current treble for this channel
        await sendData('bass');    // Send current bass for this channel
        console.log(`Sent initial state for current channel ${currentChannel}.`);

    } catch (error) {
        // --- Failure ---
        console.error('Error during connectDevice:', error);
        let errorMsg = error.message;
        if (error.name === 'NotFoundError') {
            errorMsg = 'No device selected or found.';
        } else if (error.name === 'NotAllowedError') {
            errorMsg = 'Bluetooth permission denied or cancelled.';
        } else if (error.name === 'NetworkError') {
            errorMsg = 'Network error or Bluetooth adapter off.';
        } else if (error.message.includes('No Services Found')) {
            errorMsg = 'Device found but required service not present.';
        } else if (error.message.includes('Missing characteristic')) {
            errorMsg = `Device service found but a characteristic is missing: ${error.message.split(': ')[1]}`;
        }

        // Update status display
        statusDisplay.textContent = `Status: ${errorMsg}`;
        // Reset connect button state
        connectButton.textContent = 'Connect';
        connectButton.disabled = false; // Enable connect button for retry

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
    bluetoothDevice.gatt.disconnect();
}


function onDisconnected() {
    console.log('Bluetooth device disconnected.');
    statusDisplay.textContent = 'Status: Not connected';
    connectButton.textContent = 'Connect';
    connectButton.disabled = false;

    // Reset global mute state to reflect current UI (which might be the default channel 1 state loaded)
    // No need to reset directly, loadCurrentChannelStateIntoUI will handle it on re-connect
    // isMuted = false;
    // muteButton.textContent = 'Mute';
    // muteButton.classList.remove('muted');
    // storedVolumeBeforeMute = 50;

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

// New helper function to load the state of the currentChannel into the UI
function loadCurrentChannelStateIntoUI() {
    const state = channelStates[currentChannel];
    if (!state) {
        console.warn(`No state found for channel ${currentChannel}. Initializing default.`);
        // Fallback for missing state (should not happen if initialized properly)
        channelStates[currentChannel] = {
            volume: 50,
            treble: 0,
            bass: 0,
            channelIsMuted: false,
            channelStoredVolumeBeforeMute: 50
        };
        // Re-get state after creating it
        const newState = channelStates[currentChannel];
        volumeInput.value = newState.volume;
        trebleInput.value = newState.treble;
        bassInput.value = newState.bass;

        // Synchronize global mute state with the channel's mute state
        isMuted = newState.channelIsMuted;
        storedVolumeBeforeMute = newState.channelStoredVolumeBeforeMute;

    } else {
        volumeInput.value = state.volume;
        trebleInput.value = state.treble;
        bassInput.value = state.bass;

        // Synchronize global mute state with the channel's mute state
        isMuted = state.channelIsMuted;
        storedVolumeBeforeMute = state.channelStoredVolumeBeforeMute;
    }

    updateSliderValue('volume');
    updateSliderValue('treble');
    updateSliderValue('bass');

    if (isMuted) {
        muteButton.textContent = 'Unmute';
        muteButton.classList.add('muted');
    } else {
        muteButton.textContent = 'Mute';
        muteButton.classList.remove('muted');
    }
    // Ensure the correct radio button is checked (important on initial load or if not handled by event)
    const radioToCheck = document.getElementById(`channel${currentChannel}`);
    if (radioToCheck) {
        radioToCheck.checked = true;
    }
}


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

    const currentState = channelStates[currentChannel];
    if (!currentState) {
        console.error("No state found for current channel during preset apply.");
        return;
    }

    // Update UI
    bassInput.value = preset.bass;
    updateSliderValue('bass');
    trebleInput.value = preset.treble;
    updateSliderValue('treble');

    // Update channelStates
    currentState.bass = preset.bass;
    currentState.treble = preset.treble;

    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        try {
            await Promise.all([ sendData('bass'), sendData('treble') ]);
            console.log('Preset values sent successfully.');
             showFeedback(event.target); // Feedback on the button itself
        } catch(error) {
            console.error('Error sending preset values.', error);
            statusDisplay.textContent = 'Status: Error applying preset';
            if (error.name === 'NetworkError' || error.message.includes('disconnected')) {
                 console.log("Detected disconnection during preset send.");
                 onDisconnected();
            }
        }
    }
}

function handleAdjustButtonClick(event) {
    const button = event.currentTarget;
    const controlType = button.dataset.control;
    const isIncrement = button.classList.contains('btn-increment');
    const slider = document.getElementById(`${controlType}Input`);
    if (!slider) return;

    const currentState = channelStates[currentChannel];
    if (!currentState) {
        console.error("No state found for current channel during adjust button click.");
        return;
    }

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
            currentState.channelIsMuted = false;
            muteButton.textContent = 'Mute';
            muteButton.classList.remove('muted');
            currentState.channelStoredVolumeBeforeMute = newValue;
            storedVolumeBeforeMute = newValue; // Sync global
        } else if (!isMuted && newValue === 0) { // Muting via button to zero
            isMuted = true;
            currentState.channelIsMuted = true;
            muteButton.textContent = 'Unmute';
            muteButton.classList.add('muted');
            // Store volume before it hit zero (if not already 0)
            currentState.channelStoredVolumeBeforeMute = currentValue > 0 ? currentValue : currentState.channelStoredVolumeBeforeMute;
            storedVolumeBeforeMute = currentState.channelStoredVolumeBeforeMute; // Sync global
            if (currentState.channelStoredVolumeBeforeMute === 0) {
                 currentState.channelStoredVolumeBeforeMute = step; // Ensure restore > 0
                 storedVolumeBeforeMute = step; // Sync global
            }
        } else if (!isMuted) { // Adjusting volume normally
            currentState.channelStoredVolumeBeforeMute = newValue;
            storedVolumeBeforeMute = newValue; // Sync global
        } else if (isMuted && newValue <= 0) { // Already muted at zero
             if (currentValue === 0) return; // Do nothing if already 0
             newValue = 0; // Ensure it stays 0
        }
    }

    // Update UI slider value
    slider.value = newValue;
    updateSliderValue(controlType);

    // Update channel state
    currentState[controlType] = newValue; // Save the new value for the current channel

    handleControlChange(controlType); // Trigger debounced send
    showFeedback(controlType); // Feedback on the slider thumb
}

function handleControlChange(type) {
    const currentState = channelStates[currentChannel];
    if (!currentState) {
        console.error("No state found for current channel during control change.");
        return;
    }

    if (type === 'channel') {
        // 1. Save state of the OLD currentChannel
        const oldChannel = currentChannel;
        if (channelStates[oldChannel]) {
            channelStates[oldChannel].volume = parseInt(volumeInput.value);
            channelStates[oldChannel].treble = parseInt(trebleInput.value);
            channelStates[oldChannel].bass = parseInt(bassInput.value);
            channelStates[oldChannel].channelIsMuted = isMuted; // Save current global mute state
            channelStates[oldChannel].channelStoredVolumeBeforeMute = storedVolumeBeforeMute; // Save current global stored volume
        }

        // 2. Update currentChannel
        currentChannel = document.querySelector('input[name="channelInput"]:checked').value;
        console.log(`Channel changed to: ${oldChannel} -> ${currentChannel}`);

        // 3. Load state of the NEW currentChannel into UI (and synchronize global mute/volume)
        loadCurrentChannelStateIntoUI();

        // 4. Send the new channel, volume, treble, and bass values to the device
        if (bluetoothDevice && bluetoothDevice.gatt.connected) {
             sendData('channel'); // Send the channel change first
             // Small delay to ensure channel is processed first by device, then send state
             setTimeout(async () => {
                await sendData('volume');
                await sendData('treble');
                await sendData('bass');
                console.log(`Sent state for channel ${currentChannel}: Volume=${channelStates[currentChannel].volume}, Treble=${channelStates[currentChannel].treble}, Bass=${channelStates[currentChannel].bass}`);
             }, 50);
        }

        showFeedback('channel'); // Provide feedback for channel change
        return; // Don't proceed with debounced send for individual controls as we've sent full state
    }

    // For volume, treble, bass changes
    updateSliderValue(type);
    // Update channel state immediately
    currentState[type] = parseInt(document.getElementById(`${type}Input`).value);


    // Handle Mute interaction for Volume Slider - Now updates channel-specific mute state
    if (type === 'volume') {
        const currentVolume = parseInt(volumeInput.value);
        if (isMuted && currentVolume > 0) { // Unmuting via slider
            isMuted = false;
            currentState.channelIsMuted = false;
            muteButton.textContent = 'Mute';
            muteButton.classList.remove('muted');
            currentState.channelStoredVolumeBeforeMute = currentVolume;
            storedVolumeBeforeMute = currentVolume; // Sync global
        } else if (!isMuted && currentVolume === 0) { // Muting via slider to zero
             if (currentState.channelStoredVolumeBeforeMute === 0) {
                 currentState.channelStoredVolumeBeforeMute = parseInt(volumeInput.step) || 1;
                 storedVolumeBeforeMute = currentState.channelStoredVolumeBeforeMute; // Sync global
             }
             isMuted = true;
             currentState.channelIsMuted = true;
             muteButton.textContent = 'Unmute';
             muteButton.classList.add('muted');
        } else if (!isMuted) { // Adjusting volume normally
            currentState.channelStoredVolumeBeforeMute = currentVolume;
            storedVolumeBeforeMute = currentVolume; // Sync global
        }
    }

    // Debounce sending data for volume, treble, bass
    const characteristicKey = type;
    const char = characteristics[characteristicKey];
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

    const currentState = channelStates[currentChannel];
    if (!currentState) {
        console.error("No state found for current channel during mute toggle.");
        return;
    }

    // Toggle the channel's mute state and sync global 'isMuted'
    isMuted = !isMuted;
    currentState.channelIsMuted = isMuted;

    let valueToSend;

    if (isMuted) {
        console.log('Muting...');
        const currentSliderVol = parseInt(volumeInput.value);
        if (currentSliderVol > 0) {
            currentState.channelStoredVolumeBeforeMute = currentSliderVol;
            storedVolumeBeforeMute = currentSliderVol; // Sync global
        }
        // Ensure stored volume is never 0 for restore unless it truly was 0.
        if (currentState.channelStoredVolumeBeforeMute === 0) {
            currentState.channelStoredVolumeBeforeMute = parseInt(volumeInput.step) || 1;
            storedVolumeBeforeMute = currentState.channelStoredVolumeBeforeMute; // Sync global
        }


        volumeInput.value = 0;
        valueToSend = 0;
        muteButton.textContent = 'Unmute';
        muteButton.classList.add('muted');
    } else {
        console.log('Unmuting...');
        // Ensure we restore to a non-zero value
        if (currentState.channelStoredVolumeBeforeMute === 0) {
            currentState.channelStoredVolumeBeforeMute = parseInt(volumeInput.step) || 1;
            storedVolumeBeforeMute = currentState.channelStoredVolumeBeforeMute; // Sync global
        }

        volumeInput.value = currentState.channelStoredVolumeBeforeMute;
        valueToSend = currentState.channelStoredVolumeBeforeMute;
        muteButton.textContent = 'Mute';
        muteButton.classList.remove('muted');
    }

    // Update the volume value in channelStates
    currentState.volume = parseInt(volumeInput.value);

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
        // Get value from UI if not provided (or from currentChannel for 'channel' type)
        if (type === 'channel') {
            dataValue = currentChannel; // Use the stored currentChannel directly
        } else {
            dataValue = document.getElementById(`${type}Input`)?.value ?? '0';
        }
    }

    console.log(`Sending ${type}: ${dataValue}`);
    try {
        const encoder = new TextEncoder();
        await characteristic.writeValueWithResponse(encoder.encode(dataValue));
        console.log(`Successfully sent ${type}: ${dataValue}`);

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

    if (isDirectElement) {
        element = controlIdentifier; // e.g., muteButton, presetButton
    } else {
        const type = controlIdentifier;
        if (type === 'channel') {
            // Find the label associated with the checked radio button
            const checkedRadio = document.querySelector('input[name="channelInput"]:checked');
            element = checkedRadio ? document.querySelector(`label[for="${checkedRadio.id}"]`) : null;
        } else if (['volume', 'treble', 'bass'].includes(type)) {
            element = document.getElementById(`${type}Input`);
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
// The original disableAllControls and enableAllControls are not used directly,
// but their logic is similar to disable/enableAudioControls.
// Keeping them for reference or if they are called elsewhere not provided.
/*
function disableAllControls(includeConnectButton = true) {
    // This function seems to use an 'allControls' array which is not defined in the provided scope.
    // Assuming it's meant to be audioControls for consistency.
    audioControls.forEach(control => {
        if (control === connectButton && !includeConnectButton) {
            // Skip disabling the connect button if specified
        } else {
            if (control) control.disabled = true;
        }
    });
     setRadioLabelsDisabled(true); // Also visually dim the labels associated with disabled radio buttons
    console.log("Controls Disabled (Connect Button Included: " + includeConnectButton + ")");
}

function enableAllControls() {
    audioControls.forEach(control => {
        if (control) control.disabled = false;
    });
     setRadioLabelsDisabled(false); // Restore visual state for labels
    console.log("Controls Enabled");
}
*/
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