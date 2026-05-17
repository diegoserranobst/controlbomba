# Control de Bomba - Nodo Node-RED

Nodo custom de Node-RED que controla una bomba de agua potable basándose en análisis de variaciones de presión. Corre en una Raspberry Pi y decide cuándo encender/apagar la bomba sin usar umbrales absolutos de presión.

## Arquitectura

```
Sensor de presión (polling cada 3s) → Node-RED → controlBomba (este nodo) → Relé bomba
```

- **Raspberry Pi**: 192.168.55.5, usuario `pi`
- **Node-RED**: servicio systemd `nodered`
- **Nodo instalado via symlink**: `/usr/lib/node_modules/node-red-contrib-controlbomba → /home/pi/controlbomba`
- **Repositorio en Pi**: `/home/pi/controlbomba` (es el mismo directorio que usa Node-RED)

## Operaciones contra la Raspberry Pi

### Desplegar cambios
```bash
scp controlBomba.js pi@192.168.55.5:/home/pi/controlbomba/controlBomba.js
ssh pi@192.168.55.5 "sudo systemctl restart nodered"
```

### Activar monitoreo (logging a CSV)
```bash
ssh pi@192.168.55.5 "echo 'etiqueta_descriptiva' > /home/pi/controlbomba/etiqueta.txt"
```

### Desactivar monitoreo
```bash
ssh pi@192.168.55.5 "rm /home/pi/controlbomba/etiqueta.txt"
```

### Override manual de bomba (solo funciona con monitoreo activo)
```bash
ssh pi@192.168.55.5 "echo 'on' > /home/pi/controlbomba/bomba_override.txt"   # forzar ON
ssh pi@192.168.55.5 "echo 'off' > /home/pi/controlbomba/bomba_override.txt"  # forzar OFF
ssh pi@192.168.55.5 "rm /home/pi/controlbomba/bomba_override.txt"            # liberar control
```

### Leer logs
```bash
ssh pi@192.168.55.5 "tail -20 /home/pi/controlbomba/logs/monitor_$(date +%Y-%m-%d).csv"
```

### Descargar logs para análisis local
```bash
scp pi@192.168.55.5:/home/pi/controlbomba/logs/monitor_*.csv ./logs/
```

## Formato del CSV de monitoreo

```
timestamp,presion,delta_presion,intervalo_ms,bomba,estadoProceso,tiempoEncendido,etiqueta,lectura_valida
```

- `presion`: lectura en bar del sensor
- `delta_presion`: diferencia con la lectura anterior
- `intervalo_ms`: milisegundos desde la lectura anterior
- `bomba`: true/false
- `estadoProceso`: fase:mensaje (ej: `PUMPING:Bomba encendida; consumo activo`)
- `tiempoEncendido`: ms acumulados con bomba encendida en el ciclo actual

## Lógica del algoritmo

### Principio fundamental

**No usa umbrales absolutos de presión.** Las variaciones de voltaje desplazan toda la escala del sensor, haciendo que umbrales fijos causen falsos positivos/negativos. En su lugar, todas las decisiones se basan en variaciones relativas.

### Máquina de estados

```
IDLE ──→ PUMPING ──→ IDLE (cuando consumo cesa)
                 ──→ COOLDOWN (si excede 1 hora)
```

### Estado IDLE (bomba apagada)

Detección de consumo por tres vías:
1. **Caída catastrófica**: delta individual < -0.40 bar → encendido inmediato
2. **Caída sostenida**: 5 lecturas consecutivas con delta < -0.04 → encendido (~15s)
3. **Sistema drenado**: presión bajo 0.5 bar por 5 lecturas → encendido (red de seguridad)

Protección post-apagado:
- 10 lecturas de gracia (~30s) después de apagar donde se ignoran caídas normales de despresurización
- Solo caídas catastróficas (< -0.40) rompen la gracia

### Estado PUMPING (bomba encendida)

Detección de fin de consumo (sin apagar la bomba para "testear"):
1. **Por nivel alto** (transición): presión sube > 0.15 bar sobre el mínimo reciente de la ventana extendida (30 lecturas) Y varianza baja por 8 lecturas consecutivas
2. **Por estabilidad prolongada**: varianza < 0.002 por 30 lecturas consecutivas (~90s)

Fases internas:
- Primeros 30s: "estabilizando" (no evalúa apagado, no acumula ventana extendida)
- Siguientes 30s: "acumulando datos" (llena ventana extendida)
- Después: "consumo activo" (evalúa condiciones de apagado)

### Estado COOLDOWN (apagado forzado)

Se activa si `tiempoEncendido >= 3600000` (1 hora). Requiere reset manual desde la UI (`msg.payload.reset = true`).

### Watchdog de comunicación

Timer independiente de 2 minutos. Si no llega ningún mensaje del sensor, apaga la bomba por seguridad.

## Hallazgos del monitoreo (2026-05-17)

### Datos del sensor

| Condición | Presión avg | Rango | Stddev | |Delta| avg |
|-----------|-------------|-------|--------|------------|
| Reposo bomba ON | 3.03 | 2.89-3.10 | 0.045 | 0.028 |
| Reposo bomba OFF | 2.99 | 2.93-3.06 | 0.033 | 0.019 |
| Consumo alto bomba ON | 2.17 | 1.98-3.09 | 0.327 | 0.033 |
| Consumo bajo bomba ON | 2.91 | 2.80-3.09 | 0.073 | 0.022 |
| Consumo alto bomba OFF | 0.40 | 0.06-3.00 | 0.812 | 0.071 |
| Consumo bajo bomba OFF | 0.55 | 0.09-3.08 | 0.985 | 0.065 |

### Comportamiento clave observado

- El ruido del sensor tiene stddev ~0.036 con máximo 2 deltas consecutivos > 0.03 en reposo
- En horario nocturno las oscilaciones aumentan a ±0.07 (posible variación de voltaje)
- El tanque de presión mantiene presión estable hasta agotarse, luego colapsa abruptamente
- Sin bomba, incluso consumo bajo drena el sistema a ~0 bar en 3 minutos
- Después de apagar la bomba, la presión cae naturalmente ~0.10-0.15 bar en 10-15 segundos (despresurización normal, no consumo)
- Con consumo bajo y bomba ON, la presión oscila entre 2.82-2.93 (rango 0.11)
- Sin consumo y bomba ON, la presión se estabiliza en ~3.0-3.1 (rango 0.09)

### Problemas encontrados y resueltos

1. **Umbrales absolutos**: fallan completamente con drift de voltaje → reemplazados por detección relativa
2. **Probe (apagar para testear)**: causa colapso de presión durante consumo → eliminado, reemplazado por detección de nivel alto + estabilidad
3. **EMA lenta para detectar estabilidad**: tarda 90+ segundos en converger → reemplazada por varianza directa
4. **Backoff en primer probe**: retrasaba apagado innecesariamente → eliminado junto con probes
5. **Cycling post-apagado**: despresurización natural dispara falso positivo → gracia de 30s
6. **Sistema drenado**: algoritmo relativo no detecta presión en piso → piso de emergencia < 0.5 bar
7. **Oscilaciones nocturnas**: 3 lecturas consecutivas insuficiente → subido a 5 lecturas
8. **ventanaExtendida incluía recuperación**: mínimo artificialmente bajo → solo acumula después de estabilización

## Parámetros actuales (configNodo)

```javascript
{
    umbralDelta: -0.04,           // delta que indica caída real
    lecturasParaConsumo: 5,       // lecturas consecutivas para confirmar consumo
    deltaCatastrofico: -0.40,     // caída única que enciende inmediatamente
    graciaPostApagado: 10,        // lecturas de gracia post-apagado (~30s)
    pisoEmergencia: 0.5,          // presión mínima absoluta (red de seguridad)
    lecturasPiso: 5,              // lecturas bajo piso para encender

    tiempoMinimoBomba: 30000,     // 30s mínimo antes de evaluar apagado
    umbralNivelAlto: 0.15,        // gap presión vs mínimo reciente para declarar sin consumo
    varianzaEstable: 0.002,       // varianza que indica estabilidad
    lecturasEstables: 8,          // lecturas estables para apagar por nivel
    lecturasEstabilidadProlongada: 30, // lecturas estables para apagar por tiempo (~90s)
    ventanaSize: 10,              // ventana para cálculo de varianza
    ventanaExtendidaSize: 30,     // ventana para tracking de mínimo reciente

    tiempoMaximoBomba: 3600000,   // 1 hora máximo continuo → COOLDOWN
    nanMaxConsecutivos: 5,        // NaN antes de apagar por seguridad
    timeoutComunicacion: 120000   // 2 min sin mensajes → apagar
}
```

## Interfaz del nodo

### Entrada (msg.payload)
- `presion`: float, lectura del sensor en bar
- `automatico`: bool, modo automático activo
- `manual`: bool, forzar bomba encendida
- `reset`: bool, resetear estado completo (sale de COOLDOWN)

### Salida (msg.payload.estado)
- `bomba`: bool, estado actual de la bomba
- `fase`: string, IDLE/PUMPING/COOLDOWN
- `tiempoEncendido`: int, ms acumulados en ciclo actual
- `excedido`: bool, flag de COOLDOWN activo
- `estadoProceso`: string, descripción legible del estado

## Cómo continuar el afinado

1. Activar monitoreo con etiqueta descriptiva
2. Dejar correr en condiciones reales por 30+ minutos
3. Descargar CSV y analizar transiciones
4. Buscar: falsos encendidos (IDLE→PUMPING sin consumo real), apagados tardíos (PUMPING prolongado sin consumo), cycling (ON/OFF repetido en <5 min)
5. Ajustar parámetros en `configNodo` según hallazgos
6. Desplegar y repetir

### Análisis rápido de transiciones
```bash
ssh pi@192.168.55.5 "grep 'ETIQUETA' /home/pi/controlbomba/logs/monitor_*.csv | awk -F',' '{print \$5}' | uniq -c"
```
Resultado ideal: bloques largos de `true` y `false` alternados, sin bloques cortos (<5 lecturas) que indiquen cycling.

### Gráfico ASCII de presión y estado
```bash
ssh pi@192.168.55.5 "cat /home/pi/controlbomba/logs/monitor_*.csv" | bash graficar.sh "" 100
```
- Primer argumento: etiqueta a filtrar (vacío = todo)
- Segundo argumento: últimas N lecturas a mostrar (default 60)
- `░` = bomba OFF, `█` = bomba ON, `>>` = transición
