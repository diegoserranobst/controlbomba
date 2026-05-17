#!/bin/bash
# Genera gráfico ASCII de presión + estado de bomba para análisis LLM
# Uso: ssh pi@192.168.55.5 "cat /home/pi/controlbomba/logs/monitor_*.csv" | bash graficar.sh [etiqueta] [ultimas_N]

ETIQUETA=${1:-""}
N=${2:-60}

awk -F',' -v etiq="$ETIQUETA" -v n="$N" '
NR==1 {next}
etiq != "" && $8 !~ etiq {next}
{lines[NR]=$0; order[++count]=NR}
END {
    start = (count > n) ? count - n + 1 : 1;
    printf "\n  TIME     BOMBA  PRESION  T.ENC   ESTADO\n";
    printf "  ────────────────────────────────────────────────────────────────────────────────\n";
    prev_bomba = "";
    for (i = start; i <= count; i++) {
        split(lines[order[i]], f, ",");
        t = substr(f[1], 12, 8);
        p = f[2] + 0;
        bomba = (f[5] == "true") ? "ON " : "OFF";
        tenc = int(f[7] / 1000);
        estado = f[6];
        gsub(/;/, " ", estado);

        if (p <= 0) continue;

        # Marcar transiciones
        marca = "  ";
        if (prev_bomba != "" && bomba != prev_bomba) marca = "→ ";
        prev_bomba = bomba;

        # Barra de presión (escala 0-4 bar, 40 chars)
        bar_len = int(p * 10);
        if (bar_len > 40) bar_len = 40;
        bar = "";
        for (j = 0; j < bar_len; j++) {
            if (bomba == "ON ") bar = bar "█";
            else bar = bar "░";
        }

        printf "%s%s  %s  %5.2f  %4ds  |%s| %s\n", marca, t, bomba, p, tenc, bar, estado;
    }
    printf "  ────────────────────────────────────────────────────────────────────────────────\n";

    # Resumen
    on_count = 0; off_count = 0; transitions = 0;
    prev = "";
    for (i = 1; i <= count; i++) {
        split(lines[order[i]], f, ",");
        b = f[5];
        if (b == "true") on_count++; else off_count++;
        if (prev != "" && b != prev) transitions++;
        prev = b;
    }
    printf "\n  RESUMEN: %d lecturas | ON: %d | OFF: %d | Transiciones: %d\n\n", count, on_count, off_count, transitions;
}'
