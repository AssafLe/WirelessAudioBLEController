# Bluetooth Audio Control Web App

## Overview

This web application allows users to connect to the Wireless Audio system built as Project A.
- **Volume** (adjustable via a slider)
- **Treble** (adjustable via a slider)
- **Bass** (adjustable via a slider)
- **Channel Selection** (switch between channels 1-4 using radio buttons)

The app provides a modern and responsive UI with real-time feedback for slider values and ensures seamless communication with the audio system.

## Features

- **Easy Bluetooth Connection** – Connect the the Wireless Audio system via BLE.
- **Real-Time Value Display** – Displays the exact value of volume, treble, and bass as you adjust them.
- **Instant Data Transmission** – Sends updates immediately upon changing a setting.
- **Minimalistic & Modern UI** – Designed for ease of use with clean styling and intuitive controls.

## How It Works

1. Click the **"Connect to Bluetooth"** button to pair with a Bluetooth-enabled audio device.
2. Adjust **Volume**, **Treble**, and **Bass** using the sliders (values update in real-time).
3. Select the **Audio Channel** (1-4) using radio buttons.
4. The app automatically sends the updated values to the connected device.

## Technologies Used

- **JavaScript (Web Bluetooth API)** for Bluetooth communication
- **HTML & CSS** for the user interface

## Setup & Usage

1. Open the `index.html` file in a modern browser (Chrome recommended).
2. Click **Connect to Bluetooth** and select your device.
3. Adjust audio settings as needed.