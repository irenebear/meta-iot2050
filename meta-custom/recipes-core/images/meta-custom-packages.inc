##
# My custom protocol stack packages for IoT2050
# All packages are ready-made Debian trixie packages (no recipe compilation needed)
#
# SPDX-License-Identifier: MIT
##

SUMMARY = "Industrial protocol stack packages (S7/OPC UA/Modbus/MQTT/etc.)"

IOT2050_META_CUSTOM_PACKAGES ?= " \
    # ---- S7 (snap7) ----
    libsnap7-1 \
    libsnap7-dev \
    # ---- OPC UA (open62541) ----
    libopen62541-1.4 \
    libopen62541-1.4-dev \
    # ---- Modbus (libmodbus) ----
    libmodbus5 \
    libmodbus-dev \
    # ---- MQTT (mosquitto broker + paho clients) ----
    mosquitto \
    mosquitto-clients \
    libpaho-mqtt-dev \
    # ---- Python bindings ----
    python3-paho-mqtt \
    python3-pymodbus \
    python3-asyncua \
    python3-canopen \
    python3-bacpypes \
    python3-xknx \
    "
