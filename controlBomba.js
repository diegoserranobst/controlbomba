const fs = require('fs');
const path = require('path');

module.exports = function (RED) {
    function ControlBombaNode(config) {
        RED.nodes.createNode(this, config);

        const ESTADOS = {
            IDLE: 'IDLE',
            PUMPING: 'PUMPING',
            COOLDOWN: 'COOLDOWN'
        };

        const configNodo = {
            // Encendido: presión bajo este umbral = consumo confirmado
            umbralEncendido: 2.3,
            lecturasEncendido: 1,

            // Apagado: mean(ventana) sobre este umbral = sin consumo
            umbralApagado: 2.95,
            lecturasApagado: 10,
            ventanaSize: 10,

            // Tiempos
            tiempoMinimoBomba: 30000,
            tiempoMaximoBomba: 3600000,

            // Seguridad
            nanMaxConsecutivos: 5,
            timeoutComunicacion: 120000
        };

        let estado = {
            bomba: false,
            fase: ESTADOS.IDLE,
            tiempoEncendido: 0,
            excedido: false,
            estadoProceso: "IDLE: Sin consumo detectado"
        };

        let signal = {
            ultimaPresion: NaN,
            ventana: [],
            bajoUmbralCount: 0,
            stableHighCount: 0,
            nanConsecutivos: 0
        };

        function calcularVarianza(arr) {
            if (arr.length < 2) return 0;
            const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
            return arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length;
        }

        function resetSignal() {
            signal.ventana = [];
            signal.bajoUmbralCount = 0;
            signal.stableHighCount = 0;
            signal.nanConsecutivos = 0;
        }

        // --- Monitor de presión ---
        const logDir = path.join(__dirname, 'logs');
        const etiquetaFile = path.join(__dirname, 'etiqueta.txt');
        const bombaOverrideFile = path.join(__dirname, 'bomba_override.txt');
        let logStream = null;
        let ultimaPresionLog = NaN;
        let ultimoTimestamp = null;

        function leerEtiqueta() {
            try {
                const contenido = fs.readFileSync(etiquetaFile, 'utf8').trim();
                return contenido || null;
            } catch (e) {
                return null;
            }
        }

        function leerBombaOverride() {
            try {
                const contenido = fs.readFileSync(bombaOverrideFile, 'utf8').trim().toLowerCase();
                if (contenido === 'on') return true;
                if (contenido === 'off') return false;
                return null;
            } catch (e) {
                return null;
            }
        }

        function abrirLog() {
            if (logStream) return;
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const fecha = new Date().toISOString().slice(0, 10);
            const logPath = path.join(logDir, `monitor_${fecha}.csv`);
            const existe = fs.existsSync(logPath);
            logStream = fs.createWriteStream(logPath, { flags: 'a' });
            if (!existe) {
                logStream.write('timestamp,presion,delta_presion,intervalo_ms,bomba,estadoProceso,tiempoEncendido,etiqueta,lectura_valida\n');
            }
        }

        function cerrarLog() {
            if (logStream) {
                logStream.end();
                logStream = null;
            }
        }

        function registrar(presion, estadoActual, etiqueta) {
            if (!logStream) return;
            const ahora = new Date();
            const ts = ahora.toISOString();
            const valida = !isNaN(presion);
            const delta = (valida && !isNaN(ultimaPresionLog))
                ? (presion - ultimaPresionLog).toFixed(4)
                : '';
            const intervalo = ultimoTimestamp
                ? (ahora.getTime() - ultimoTimestamp.getTime())
                : '';
            const presionStr = valida ? presion.toFixed(4) : '';
            const proc = estadoActual.estadoProceso.replace(/,/g, ';');
            logStream.write(`${ts},${presionStr},${delta},${intervalo},${estadoActual.bomba},${estadoActual.fase}:${proc},${estadoActual.tiempoEncendido},${etiqueta},${valida}\n`);
            ultimoTimestamp = ahora;
            if (valida) ultimaPresionLog = presion;
        }

        // --- Lógica de control ---

        function procesarAutomatico(presion) {
            const valida = !isNaN(presion);

            if (!valida) {
                signal.nanConsecutivos++;
                if (signal.nanConsecutivos >= configNodo.nanMaxConsecutivos) {
                    estado.bomba = false;
                    estado.fase = ESTADOS.IDLE;
                    estado.estadoProceso = "Sensor no disponible";
                }
                return;
            }

            signal.nanConsecutivos = 0;
            const delta = !isNaN(signal.ultimaPresion) ? presion - signal.ultimaPresion : 0;
            signal.ultimaPresion = presion;

            signal.ventana.push(presion);
            if (signal.ventana.length > configNodo.ventanaSize) {
                signal.ventana.shift();
            }

            switch (estado.fase) {
                case ESTADOS.IDLE:
                    procesarIdle(presion, delta);
                    break;
                case ESTADOS.PUMPING:
                    procesarPumping(presion, delta);
                    break;
                case ESTADOS.COOLDOWN:
                    break;
            }
        }

        function procesarIdle(presion, delta) {
            estado.bomba = false;
            estado.tiempoEncendido = 0;

            if (presion < configNodo.umbralEncendido) {
                signal.bajoUmbralCount++;
            } else {
                signal.bajoUmbralCount = 0;
            }

            if (signal.bajoUmbralCount >= configNodo.lecturasEncendido) {
                iniciarPumping("Consumo detectado; presion bajo umbral");
                return;
            }

            estado.estadoProceso = "Sin consumo detectado";
        }

        function iniciarPumping(razon) {
            estado.fase = ESTADOS.PUMPING;
            estado.bomba = true;
            estado.tiempoEncendido = 0;
            estado.estadoProceso = razon;
            signal.stableHighCount = 0;
            signal.bajoUmbralCount = 0;
        }

        function procesarPumping(presion, delta) {
            estado.bomba = true;
            estado.tiempoEncendido += 3000;

            if (estado.tiempoEncendido >= configNodo.tiempoMaximoBomba) {
                estado.fase = ESTADOS.COOLDOWN;
                estado.bomba = false;
                estado.excedido = true;
                estado.estadoProceso = "Tiempo maximo excedido; apagado forzado";
                return;
            }

            if (estado.tiempoEncendido < configNodo.tiempoMinimoBomba) {
                estado.estadoProceso = "Bomba encendida; estabilizando";
                return;
            }

            const meanVentana = signal.ventana.reduce(function(a, b) { return a + b; }, 0) / signal.ventana.length;

            if (meanVentana > configNodo.umbralApagado) {
                signal.stableHighCount++;
            } else {
                signal.stableHighCount = 0;
            }

            if (signal.stableHighCount >= configNodo.lecturasApagado) {
                estado.fase = ESTADOS.IDLE;
                estado.bomba = false;
                estado.tiempoEncendido = 0;
                signal.stableHighCount = 0;
                signal.bajoUmbralCount = 0;
                estado.estadoProceso = "Sin consumo detectado";
            } else {
                estado.estadoProceso = "Bomba encendida; consumo activo";
            }
        }

        // --- Watchdog de comunicación ---
        const node = this;
        let watchdog = null;

        function resetWatchdog() {
            if (watchdog) clearTimeout(watchdog);
            watchdog = setTimeout(() => {
                estado.bomba = false;
                estado.fase = ESTADOS.IDLE;
                estado.estadoProceso = "Comunicacion perdida; bomba apagada por seguridad";
                node.send({ payload: { estado: estado } });
                node.status({ fill: "red", shape: "dot", text: "Sin comunicacion" });
            }, configNodo.timeoutComunicacion);
        }

        resetWatchdog();

        // --- Handler principal ---

        this.on('input', (msg) => {
            resetWatchdog();
            node.status({});
            const presion = parseFloat(msg.payload.presion);
            const reset = Boolean(msg.payload.reset);
            const automatico = Boolean(msg.payload.automatico);
            const manual = Boolean(msg.payload.manual);

            const etiqueta = leerEtiqueta();
            if (etiqueta) {
                abrirLog();
            } else {
                cerrarLog();
            }

            if (reset) {
                estado = {
                    bomba: false,
                    fase: ESTADOS.IDLE,
                    tiempoEncendido: 0,
                    excedido: false,
                    estadoProceso: "IDLE: Sin consumo detectado"
                };
                resetSignal();
                if (etiqueta) registrar(presion, estado, etiqueta);
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            const override = etiqueta ? leerBombaOverride() : null;
            if (override !== null) {
                estado.bomba = override;
                estado.estadoProceso = "Monitor: Bomba " + (override ? "ON" : "OFF") + " (override)";
                if (etiqueta) registrar(presion, estado, etiqueta);
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            if (automatico) {
                procesarAutomatico(presion);
            } else if (manual) {
                estado.bomba = true;
                estado.fase = ESTADOS.PUMPING;
                estado.estadoProceso = "Manual: Bomba encendida por usuario";
            } else {
                estado.bomba = false;
                estado.fase = ESTADOS.IDLE;
                estado.estadoProceso = "Manual: Bomba apagada por usuario";
            }

            if (etiqueta) registrar(presion, estado, etiqueta);
            msg.payload.estado = estado;
            this.send(msg);
        });

        this.on('close', () => {
            if (watchdog) clearTimeout(watchdog);
            cerrarLog();
        });
    }

    RED.nodes.registerType("controlBomba", ControlBombaNode);
};
