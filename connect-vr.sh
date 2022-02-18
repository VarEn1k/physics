#!/usr/bin/env bash

adb tcpip 5555
sleep 3
adb shell ip route
ipAddress=$(adb shell ip route | grep -E -o "([0-9]{1,3}[\.]){3}[0-9]{1,3}\s+$" | grep -E -o "([0-9]{1,3}[\.]){3}[0-9]{1,3}")

echo "Connecting to $ipAddress ..."

adb connect "$ipAddress":5555

adb devices

#scrcpy --crop 1096:1240:174:150