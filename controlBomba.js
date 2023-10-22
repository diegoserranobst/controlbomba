module.exports = function (RED) {
    function ControlBombaNode(config) {
        RED.nodes.createNode(this, config);

        const estadoInicial = {
            bomba: false,
            tiempoEncendido: 0,
            tiempoUltimaPresionValida: 0,
            excedido: false
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
            const vacio = Boolean(msg.payload.vacio);
            const automatico = Boolean(msg.payload.automatico);
            const manual = Boolean(msg.payload.manual);

            if (reset) {
                estado = Object.assign({}, estadoInicial);
            }

            if (vacio) {
                estado.bomba = false;
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            if (estado.excedido) {
                msg.payload.estado = estado;
                this.send(msg);
                return;
            }

            if (automatico) {
                if (presion <= configNodo.presionMaxima) {
                    estado.tiempoUltimaPresionValida = 0;
                    estado.bomba = true;
                } else {
                    estado.tiempoUltimaPresionValida += 3000;
                }

                if (estado.tiempoUltimaPresionValida >= configNodo.tiempoRebote) {
                    estado.bomba = false;
                }
            } else if (manual && !automatico) {
                estado.bomba = true;
            }

            if (estado.bomba) {
                estado.tiempoEncendido += 3000;

                if (estado.tiempoEncendido >= configNodo.tiempoMaximoBomba && presion < 1.5) {
                    estado.bomba = false;
                    estado.tiempoEncendido = 0;
                }

                if (estado.tiempoEncendido >= configNodo.tiempoExcedido) {
                    estado.bomba = false;
                    estado.excedido = true;
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
