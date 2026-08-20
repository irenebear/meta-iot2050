##
# My custom protocol stack packages for IoT2050
# All packages are ready-made Debian trixie packages (no recipe compilation needed)
#
# SPDX-License-Identifier: MIT
##

SUMMARY = "Industrial protocol stack packages (S7/OPC UA/Modbus/MQTT/etc.)"

# --- S7 (snap7) ---
# --- OPC UA (open62541) ---
# --- Modbus (libmodbus) ---
# --- MQTT (mosquitto broker + paho clients) ---
# --- Python bindings (paho-mqtt / pymodbus / xknx) ---
IOT2050_META_CUSTOM_PACKAGES ?= " \
    libsnap7-1 \
    libsnap7-dev \
    libopen62541-1.4 \
    libopen62541-1.4-dev \
    libmodbus5 \
    libmodbus-dev \
    mosquitto \
    mosquitto-clients \
    libpaho-mqtt-dev \
    python3-paho-mqtt \
    python3-pymodbus \
    python3-xknx \
    "
