# ControlBombaNode for Node-RED

## Overview

The `ControlBombaNode` is a custom Node-RED node designed to manage and control a water pump based on various parameters such as pressure, water level, and user-defined modes (automatic or manual). This node is particularly useful for IoT projects where precise control and monitoring of water pumps are crucial.

## Features

1. **Automatic Mode**: Controls the pump based on water pressure, adhering to maximum and minimum thresholds.
2. **Manual Mode**: Allows manual control over the pump.
3. **Safety Checks**: Includes checks for empty water levels, time limits for pump operation, and configurable reset functionality.
4. **State Monitoring**: Keeps track of the pump's operational time and other state variables, which are sent back as output for further use or logging.

## Input Payload Description

The input payload to the node should include the following fields:

- `presion`: The current pressure (float).
- `reset`: Boolean to reset the internal state, if needed.
- `estadoBomba`: The actual current state of the pump (Boolean).
- `vacio`: Boolean indicating whether the water tank is empty.
- `automatico`: Boolean to set the system to automatic mode.
- `manual`: Boolean to enable manual mode.
- `nivelVacio`: Float value indicating the water level at which the pump should stop.
- `nivelActual`: Current water level (float).
- `nivelReinicio`: Float value indicating the water level needed to restart the pump.

**Example Payload:**

```javascript
msg.payload = {
    presion: 2.5,
    reset: false,
    estadoBomba: true,
    vacio: false,
    automatico: true,
    manual: false,
    nivelVacio: 0.2,
    nivelActual: 0.5,
    nivelReinicio: 0.8
};
```
** Example Flow JSON**
```json
[
    {
        "id": "1bb46f2f.55fba1",
        "type": "tab",
        "label": "Flujo de prueba para controlBomba",
        "disabled": false,
        "info": ""
    },
    {
        "id": "c74e682d.6c9ab8",
        "type": "inject",
        "z": "1bb46f2f.55fba1",
        "name": "Simulación de presión y niveles",
        "props": [
            {
                "p": "payload",
                "v": "{\"presion\": 2.5, \"reset\": false, \"estadoBomba\": true, \"vacio\": false, \"automatico\": true, \"manual\": false, \"nivelVacio\": 0.2, \"nivelActual\": 0.5, \"nivelReinicio\": 0.8}",
                "vt": "json"
            }
        ],
        "repeat": "3",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "",
        "x": 270,
        "y": 120,
        "wires": [
            [
                "a0452b5b.82d7a8"
            ]
        ]
    },
    {
        "id": "a0452b5b.82d7a8",
        "type": "controlBomba",
        "z": "1bb46f2f.55fba1",
        "name": "",
        "x": 550,
        "y": 120,
        "wires": [
            [
                "f1d891fa.2d9ca"
            ]
        ]
    },
    {
        "id": "f1d891fa.2d9ca",
        "type": "debug",
        "z": "1bb46f2f.55fba1",
        "name": "",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "statusVal": "",
        "statusType": "auto",
        "x": 770,
        "y": 120,
        "wires": []
    }
]
```