module.exports = function (RED) {
    function ControlBombaNode(config) {
        RED.nodes.createNode(this, config);

        const estadoInicial = {
            bomba: false,
            tiempoEncendido: 0,
            tiempoUltimaPresionValida: 0,
            excedido: false,
            estadoProceso: "Inactivo"
        };

        const configNodo = {
            presionMinima: 2.0,
            presionMaxima: 2.95,
            tiempoRebote: 100,
            tiempoMaximoBomba: 1200000,
            tiempoExcedido: 1200000
        };

        let estado = Object.assign({}, estadoInicial);

        this.on('input', (msg) => {
            const presion = parseFloat(msg.payload.presion);
            const reset = Boolean(msg.payload.reset);
            const automatico = Boolean(msg.payload.automatico);
            const manual = Boolean(msg.payload.manual);

            // Reinicio del estado
            if (reset) {
                estado = Object.assign({}, estadoInicial);
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            // Validación de la presión
            if (isNaN(presion)) {
                estado.bomba = false;
                estado.estadoProceso = "Presión no válida";
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            // Si el sistema está en modo automático
            if (automatico) {
                if (presion < configNodo.presionMinima) {
                    estado.bomba = true;
                    estado.estadoProceso = "Automático: Bomba encendida por presión baja";
                } else if (presion > configNodo.presionMaxima) {
                    estado.bomba = false;
                    estado.estadoProceso = "Automático: Bomba apagada por presión alta";
                }

                if (estado.bomba) {
                    estado.tiempoEncendido += 3000;

                    // Verificar si excede el tiempo máximo permitido
                    if (estado.tiempoEncendido >= configNodo.tiempoMaximoBomba) {
                        estado.bomba = false;
                        estado.tiempoEncendido = 0;
                        estado.estadoProceso = "Tiempo máximo alcanzado, bomba apagada";
                    }
                } else {
                    estado.tiempoEncendido = 0;
                }

                if (estado.tiempoEncendido >= configNodo.tiempoExcedido) {
                    estado.bomba = false;
                    estado.excedido = true;
                    estado.estadoProceso = "Tiempo excedido, apagado forzado";
                }
            }

            // Si el sistema está en modo manual
            if (manual) {
                estado.bomba = true;
                estado.estadoProceso = "Manual: Bomba encendida por usuario";
            } else if (!automatico) {
                estado.bomba = false;
                estado.estadoProceso = "Manual: Bomba apagada por usuario";
            }

            // Enviar el estado actualizado
            msg.payload.estado = estado;
            this.send(msg);
        });
    }

    RED.nodes.registerType("controlBomba", ControlBombaNode);
};
