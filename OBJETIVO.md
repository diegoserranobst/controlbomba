# Objetivo del algoritmo de control de bomba

## Criterios de éxito

1. **Encendido por consumo real**: La bomba se enciende dentro de 15 segundos de iniciado un consumo de agua (cualquier magnitud).

2. **Sin cortes durante consumo**: Una vez encendida, la bomba NO se apaga mientras haya consumo activo — ni un solo corte perceptible por el usuario.

3. **Apagado oportuno**: La bomba se apaga dentro de 2 minutos después de que todo consumo haya cesado.

4. **Sin falsos encendidos**: Estando todo cerrado, la bomba NO se enciende por ruido del sensor, oscilaciones de voltaje, ni despresurización natural.

5. **Sin cycling**: No puede haber encendido/apagado repetido en un periodo de 5 minutos (excepto por consumo intermitente real).

6. **Seguridad**: Si se pierde comunicación (2 min) o se excede 1 hora continua, la bomba se apaga.

## Métrica de validación

En una sesión de 30 minutos con uso normal del hogar, cada ciclo ON/OFF debe corresponder a un evento de consumo real. Cero transiciones espurias (encendidos sin consumo, apagados durante consumo, o cycling repetitivo sin causa). La cantidad de ciclos legítimos depende del uso — puede ser 2 o 20, lo importante es que todos sean reales.
