const controlBomba = require('./controlBomba');

function simulador() {
    let presion = Math.random() * (3.0 - 1.0) + 1.0;
    let reset = false;

    const resultado = controlBomba(presion, reset);
    console.log(`Presión: ${presion.toFixed(2)} - Estado de la bomba: ${resultado.bomba} - Tiempo encendido: ${resultado.tiempoEncendido}`);

    if (resultado.excedido) {
        console.log("Se ha excedido el tiempo máximo de la bomba. Se necesita un reset.");
        return;
    }

    setTimeout(simulador, 3000);
}

simulador();
