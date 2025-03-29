let bluetoothDevice;
let characteristics = {};

const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUIDS = {
    volume: '0000ffe1-0000-1000-8000-00805f9b34fb',
    channel: '0000ffe2-0000-1000-8000-00805f9b34fb',
    treble: '0000ffe3-0000-1000-8000-00805f9b34fb',
    bass: '0000ffe4-0000-1000-8000-00805f9b34fb'
};

document.getElementById('connect').addEventListener('click', async () => {
    try {
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        });

        const server = await bluetoothDevice.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);

        for (let key in CHARACTERISTIC_UUIDS) {
            characteristics[key] = await service.getCharacteristic(CHARACTERISTIC_UUIDS[key]);
        }

        document.getElementById('status').textContent = 'Status: Connected';

        // Set default values and send them to the characteristics
        document.getElementById("channel1").checked = true;
        document.getElementById("volumeInput").value = 50;
        document.getElementById("trebleInput").value = 0;
        document.getElementById("bassInput").value = 0;

        document.getElementById("volumeValue").textContent = "50";
        document.getElementById("trebleValue").textContent = "0";
        document.getElementById("bassValue").textContent = "0";

        await sendData('channel');
        await sendData('volume');
        await sendData('treble');
        await sendData('bass');
    } catch (error) {
        console.error(error);
        document.getElementById('status').textContent = 'Status: Connection failed';
    }
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("channel1").checked = true;
    document.getElementById("volumeInput").value = 50;
    document.getElementById("trebleInput").value = 0;
    document.getElementById("bassInput").value = 0;

    document.getElementById("volumeInput").addEventListener("input", () => {
        document.getElementById("volumeValue").textContent = document.getElementById("volumeInput").value;
    });
    document.getElementById("trebleInput").addEventListener("input", () => {
        document.getElementById("trebleValue").textContent = document.getElementById("trebleInput").value;
    });
    document.getElementById("bassInput").addEventListener("input", () => {
        document.getElementById("bassValue").textContent = document.getElementById("bassInput").value;
    });
});

async function sendData(type) {
    if (!characteristics[type]) {
        alert('Not connected to a device!');
        return;
    }
    let data;
    if (type === 'channel') {
        data = document.querySelector('input[name="channelInput"]:checked').value;
    } else {
        data = document.getElementById(`${type}Input`).value;
    }
    const encoder = new TextEncoder();
    await characteristics[type].writeValue(encoder.encode(data));
}
