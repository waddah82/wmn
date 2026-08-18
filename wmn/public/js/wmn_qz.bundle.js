/* Managed QZ Tray client bundle. Loaded lazily only when selected by the QZ adapter. */
import * as qz from "qz-tray";

window.WMN_QZ_CLIENT = qz;
if (!window.qz) window.qz = qz;
