let bluetoothDevice;
let characteristics = {};

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
const connectButton = document.getElementById('connect');
const statusDisplay = document.getElementById('status');
const volumeInput = document.getElementById('volumeInput');
const volumeValue = document.getElementById('volumeValue');
const trebleInput = document.getElementById('trebleInput');
const trebleValue = document.getElementById('trebleValue');
const bassInput = document.getElementById('bassInput');
const bassValue = document.getElementById('bassValue');
const channelInputs = document.querySelectorAll('input[name="channelInput"]');
const presetButtons = document.querySelectorAll('.btn-preset'); // Get all preset buttons

const feedbackTimeouts = {};

// --- Bluetooth Connection ---
connectButton.addEventListener('click', async () => {
    try {
        statusDisplay.textContent = 'Status: Connecting...';
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            // Use filter for specific service instead of acceptAllDevices if possible
            filters: [{ services: [SERVICE_UUID] }],
             //filters: [{ name: 'YourDeviceName' }], // Alternatively filter by name
            // acceptAllDevices: true, // Use filters if possible for better UX
            optionalServices: [SERVICE_UUID]
        });

        // Optional: Add disconnect listener
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        const server = await bluetoothDevice.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);

        // Clear previous characteristics if reconnecting
        characteristics = {};
        for (let key in CHARACTERISTIC_UUIDS) {
            try {
                characteristics[key] = await service.getCharacteristic(CHARACTERISTIC_UUIDS[key]);
                console.log(`Found Characteristic: ${key}`);
            } catch (charError) {
                 console.error(`Characteristic ${key} (${CHARACTERISTIC_UUIDS[key]}) not found!`, charError);
                 statusDisplay.textContent = `Error: Characteristic ${key} missing`;
                 // Optionally disconnect or disable controls for missing characteristics
                 return; // Stop connection process if a critical characteristic is missing
            }
        }

        statusDisplay.textContent = `Status: Connected to ${bluetoothDevice.name || 'device'}`;

        // Set initial values from UI (or defaults if needed) and send them
        await syncAllControls();

    } catch (error) {
        console.error('Bluetooth Connection Error:', error);
        statusDisplay.textContent = `Status: Connection failed (${error.message})`;
        // Reset characteristics if connection fails
        characteristics = {};
        if (bluetoothDevice) {
             bluetoothDevice.removeEventListener('gattserverdisconnected', onDisconnected);
        }
        bluetoothDevice = null;
    }
});

function onDisconnected() {
    statusDisplay.textContent = 'Status: Device disconnected';
    console.log('Bluetooth device disconnected.');
    characteristics = {}; // Clear characteristics
    bluetoothDevice = null; // Clear device reference
    // Optionally disable controls here
}

// --- Initial Setup & Event Listeners ---
document.addEventListener("DOMContentLoaded", () => {
    // Set default UI state (doesn't send anything yet)
    document.getElementById("channel1").checked = true;
    volumeInput.value = 50;
    trebleInput.value = 0;
    bassInput.value = 0;
    updateSliderValue('volume');
    updateSliderValue('treble');
    updateSliderValue('bass');

    // Slider listeners
    volumeInput.addEventListener("input", () => handleControlChange('volume'));
    trebleInput.addEventListener("input", () => handleControlChange('treble'));
    bassInput.addEventListener("input", () => handleControlChange('bass'));

    // Channel listeners
    channelInputs.forEach(input => {
        input.addEventListener('change', () => handleControlChange('channel'));
    });

    // EQ Preset Button Listeners
    presetButtons.forEach(button => {
        button.addEventListener('click', handlePresetClick);
    });
});

// --- Update Slider Value Display ---
function updateSliderValue(type) {
    const input = document.getElementById(`${type}Input`);
    const valueSpan = document.getElementById(`${type}Value`);
    if (input && valueSpan) {
        valueSpan.textContent = input.value;
    }
}

// --- Handle Preset Button Clicks ---
async function handlePresetClick(event) {
    const presetName = event.target.dataset.preset;
    const preset = EQ_PRESETS[presetName];

    if (!preset) {
        console.error(`Preset "${presetName}" not found!`);
        return;
    }

    console.log(`Applying preset: ${presetName}`, preset);

    // Update UI First
    bassInput.value = preset.bass;
    updateSliderValue('bass');
    trebleInput.value = preset.treble;
    updateSliderValue('treble');

    // Send updated values if connected
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        try {
            // Send concurrently
            await Promise.all([
                sendData('bass'), // sendData will now handle feedback internally
                sendData('treble') // sendData will now handle feedback internally
            ]);
             console.log('Preset values sent successfully.');
             // Optional: Feedback on the preset button itself?
             // showFeedback(event.target); // If you adapt showFeedback to handle button elements
        } catch(error) {
            // Error is logged within sendData now, but maybe show general preset error
            console.error('Error sending one or more preset values.', error);
            alert('Error applying preset. Check connection.');
        }
    } else {
        console.log('Device not connected. Preset applied to UI only.');
    }
}


// --- Handle Control Changes (Sliders/Radio) ---
function handleControlChange(type) {
    if (type !== 'channel') { // Update display for sliders
        updateSliderValue(type);
    }
    // Debounce sending data slightly, especially for sliders,
    // to avoid flooding the Bluetooth characteristic.
    // Clear previous timeout if exists
    clearTimeout(characteristics[type]?.debounceTimer);
    characteristics[type].debounceTimer = setTimeout(() => {
        sendData(type);
    }, 150); // Send data after 150ms of inactivity
}

// --- Send Data to Bluetooth Characteristic ---
async function sendData(type) {
    // Check connection and characteristic existence
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
        console.warn(`SendData (${type}): Not connected.`);
        return; // Don't try to send if not connected
    }
     if (!characteristics[type]) {
        console.error(`SendData (${type}): Characteristic not available.`);
        return; // Don't try to send if characteristic missing
    }

    let dataValue;
    if (type === 'channel') {
        const checkedChannel = document.querySelector('input[name="channelInput"]:checked');
        dataValue = checkedChannel ? checkedChannel.value : '1';
    } else {
        dataValue = document.getElementById(`${type}Input`).value;
    }

    console.log(`Sending ${type}: ${dataValue}`);
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(dataValue);

    try {
        await characteristics[type].writeValueWithResponse(encodedData);
        console.log(`Successfully sent ${type}: ${dataValue}`);

        // --- SUCCESS: Trigger Visual Feedback ---
        showFeedback(type);
        // --- End Feedback Trigger ---

    } catch (error) {
        console.error(`Error sending ${type} data:`, error);
        statusDisplay.textContent = `Status: Error sending ${type}`;
        if (error.name === 'NetworkError') {
             onDisconnected();
        }
        // --- ERROR: Do NOT show feedback ---
    }
}

// --- Helper to send all current settings ---
async function syncAllControls() {
     console.log('Syncing all controls to device...');
    // Check connection before attempting to sync
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
        console.warn("Sync aborted: Not connected.");
        return;
    }
    try {
        // Send channel first, then others. Use Promise.all for parallel sends.
        await sendData('channel');
        await Promise.all([
            sendData('volume'),
            sendData('treble'),
            sendData('bass')
        ]);
        console.log('All controls synced.');
    } catch(error) {
         console.error('Error during initial sync:', error);
         statusDisplay.textContent = 'Status: Error syncing initial values.';
    }
}

// --- Helper Function for Visual Feedback ---
function showFeedback(controlType) {
    let element;

    if (controlType === 'channel') {
        const checkedRadio = document.querySelector('input[name="channelInput"]:checked');
        if (checkedRadio) {
            // Find the label associated with the checked radio button
            element = document.querySelector(`label[for="${checkedRadio.id}"]`);
        }
    } else if (['volume', 'treble', 'bass'].includes(controlType)) {
        element = document.getElementById(`${controlType}Input`);
    }

    if (!element) {
        console.warn(`Feedback element not found for type: ${controlType}`);
        return;
    }

    const feedbackClass = 'control-success-glow';
    const timeoutKey = element.id || element.getAttribute('for'); // Unique key for timeout

    // Clear any existing timeout for this specific element
    if (feedbackTimeouts[timeoutKey]) {
        clearTimeout(feedbackTimeouts[timeoutKey]);
        element.classList.remove(feedbackClass); // Remove class immediately if re-triggering
        // Short delay before re-applying to ensure visual reset
        requestAnimationFrame(() => requestAnimationFrame(() => applyFeedback(element, feedbackClass, timeoutKey)));
    } else {
         applyFeedback(element, feedbackClass, timeoutKey);
    }
}

function applyFeedback(element, feedbackClass, timeoutKey) {
    element.classList.add(feedbackClass);
    // Store the timeout ID
    feedbackTimeouts[timeoutKey] = setTimeout(() => {
        element.classList.remove(feedbackClass);
        delete feedbackTimeouts[timeoutKey]; // Clean up timeout reference
    }, 600); // Duration of the glow effect in milliseconds
}