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
            presionMaxima: 3.0,
            tiempoRebote: 9000,
            tiempoMaximoBomba: 300000,
            tiempoExcedido: 1800000
        };

        let estado = Object.assign({}, estadoInicial);

        this.on('input', (msg) => {
            const presion = parseFloat(msg.payload.presion);
            const reset = Boolean(msg.payload.reset);
            const estadoBomba = Boolean(msg.payload.estadoBomba);
            const automatico = Boolean(msg.payload.automatico);
            const manual = Boolean(msg.payload.manual);
            const nivelVacio = parseFloat(msg.payload.nivelVacio);
            const nivelActual = parseFloat(msg.payload.nivelActual);
            const nivelReinicio = parseFloat(msg.payload.nivelReinicio);

            if (reset) {
                estado = Object.assign({}, estadoInicial);
            }

            if (isNaN(nivelActual)) {
                estado.bomba = false;
                estado.estadoProceso = "Nivel actual no disponible";
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            if (nivelActual <= nivelVacio) {
                estado.bomba = false;
                estado.estadoProceso = "Nivel de vacío alcanzado";
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            if (nivelActual >= nivelReinicio) {
                estado.estadoProceso = "Nivel de reinicio alcanzado, funcionamiento normal";
            }

            if (estado.excedido) {
                estado.estadoProceso = "Tiempo excedido";
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            if (automatico) {
                if (presion <= configNodo.presionMaxima) {
                    estado.tiempoUltimaPresionValida = 0;
                    estado.bomba = true;
                    estado.estadoProceso = "Automático: ON";
                } else {
                    estado.tiempoUltimaPresionValida += 3000;
                }

                if (estado.tiempoUltimaPresionValida >= configNodo.tiempoRebote) {
                    estado.bomba = false;
                    estado.estadoProceso = "Automático: OFF por rebote";
                }
            } else if (manual) {
                estado.bomba = true;
                estado.estadoProceso = "Manual: ON";
            } else {
                estado.bomba = false;
                estado.estadoProceso = "Manual: OFF";
            }

            if (estado.bomba) {
                estado.tiempoEncendido += 3000;

                if (estado.tiempoEncendido >= configNodo.tiempoMaximoBomba && presion < 1.5) {
                    estado.bomba = false;
                    estado.tiempoEncendido = 0;
                    estado.estadoProceso = "Tiempo máximo alcanzado, bomba apagada";
                }

                if (estado.tiempoEncendido >= configNodo.tiempoExcedido) {
                    estado.bomba = false;
                    estado.excedido = true;
                    estado.estadoProceso = "Tiempo excedido";
                }
            } else {
                estado.tiempoEncendido = 0;
            }

            msg.payload.estado = estado;
            this.send(msg);
        });
    }
    RED.nodes.registerType("controlBomba", ControlBombaNode);
};
