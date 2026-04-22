#!/usr/bin/env python3
"""GTK drag-source helper.

Modes:
1) Single file (legacy):
    python3 drag_helper.py <filepath> [display_name]
2) Batch table mode:
    python3 drag_helper.py --manifest <manifest.json> --csv <data.csv>
"""
import sys
import os
import signal
import csv
import json

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib

def parse_args(argv):
    if len(argv) >= 2 and argv[1] == "--manifest":
        if len(argv) < 5 or argv[3] != "--csv":
            print("Usage: drag_helper.py --manifest <manifest.json> --csv <data.csv>", file=sys.stderr)
            sys.exit(1)
        return {
            "mode": "batch",
            "manifest_path": os.path.abspath(argv[2]),
            "csv_path": os.path.abspath(argv[4]),
        }

    if len(argv) < 2:
        print("Usage: drag_helper.py <filepath> [display_name]", file=sys.stderr)
        sys.exit(1)
    filepath = os.path.abspath(argv[1])
    display_name = argv[2] if len(argv) >= 3 else os.path.basename(filepath)
    return {
        "mode": "single",
        "filepath": filepath,
        "display_name": display_name,
    }


ARGS = parse_args(sys.argv)


def safe_text(value):
    return str(value or "").strip()


def read_csv_rows(csv_path):
    if not os.path.isfile(csv_path):
        return [], ["filename", "name1", "name2", "description", "deposited"]
    try:
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            fieldnames = list(reader.fieldnames or ["filename", "name1", "name2", "description", "deposited"])
        return rows, fieldnames
    except Exception:
        return [], ["filename", "name1", "name2", "description", "deposited"]


def write_csv_rows(csv_path, rows, fieldnames):
    if "filename" not in fieldnames:
        fieldnames = ["filename"] + [f for f in fieldnames if f != "filename"]
    for key in ("name1", "name2", "description", "deposited"):
        if key not in fieldnames:
            fieldnames.append(key)
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            out = {k: safe_text(row.get(k, "")) for k in fieldnames}
            writer.writerow(out)


def mark_deposited_in_csv(csv_path, filename):
    rows, fieldnames = read_csv_rows(csv_path)
    target = safe_text(filename)
    found = False
    for row in rows:
        if safe_text(row.get("filename")) == target:
            row["deposited"] = "1"
            found = True
            break
    if not found:
        rows.append({
            "filename": target,
            "name1": "",
            "name2": "",
            "description": "",
            "deposited": "1",
        })
    write_csv_rows(csv_path, rows, fieldnames)


class DragChip(Gtk.Window):
    def __init__(self, filepath, display_name):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.filepath = filepath
        self.display_name = display_name

        self.set_title("NeuRail — Glisser le fichier")
        self.set_keep_above(True)
        self.set_default_size(360, 64)
        self.set_resizable(False)
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)

        ebox = Gtk.EventBox()
        ebox.set_above_child(True)

        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        box.set_margin_start(14)
        box.set_margin_end(14)
        box.set_margin_top(10)
        box.set_margin_bottom(10)

        icon = Gtk.Image.new_from_icon_name("text-x-generic", Gtk.IconSize.DND)
        box.pack_start(icon, False, False, 0)

        label = Gtk.Label()
        label.set_markup(f"<b>Glisse-moi dans Storga</b>\n<small>{GLib.markup_escape_text(display_name)}</small>")
        label.set_ellipsize(3)
        label.set_max_width_chars(45)
        label.set_xalign(0)
        box.pack_start(label, True, True, 0)

        ebox.add(box)
        self.add(ebox)

        targets = [Gtk.TargetEntry.new("text/uri-list", 0, 0)]
        ebox.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, targets, Gdk.DragAction.COPY)
        ebox.connect("drag-data-get", self.on_drag_data_get)

    def on_drag_data_get(self, _widget, _context, data, _info, _time):
        uri = GLib.filename_to_uri(self.filepath)
        data.set_uris([uri])


class BatchDragWindow(Gtk.Window):
    def __init__(self, manifest_path, csv_path):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.csv_path = csv_path
        self.rows = []

        self.set_title("NeuRail — Dépôt Storga")
        self.set_keep_above(True)
        self.set_default_size(980, 560)
        self.set_resizable(True)
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)

        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        outer.set_margin_start(10)
        outer.set_margin_end(10)
        outer.set_margin_top(10)
        outer.set_margin_bottom(10)
        self.add(outer)

        title = Gtk.Label()
        title.set_markup("<b>Fichiers prêts au dépôt Storga</b>")
        title.set_xalign(0)
        outer.pack_start(title, False, False, 0)

        subtitle = Gtk.Label()
        subtitle.set_xalign(0)
        subtitle.set_text("Glisse une ligne vers Storga. Les lignes déposées sont grisées et conservées dans la fenêtre.")
        outer.pack_start(subtitle, False, False, 0)

        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        header.get_style_context().add_class("linked")
        for text, width in [("Fichier", 280), ("Nom 1", 120), ("Nom 2", 120), ("Description", 380), ("État", 80)]:
            lbl = Gtk.Label(label=text)
            lbl.set_xalign(0)
            lbl.set_size_request(width, -1)
            header.pack_start(lbl, False, False, 0)
        outer.pack_start(header, False, False, 0)

        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        outer.pack_start(scroll, True, True, 0)

        self.list_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        scroll.add(self.list_box)

        self.load_manifest(manifest_path)

    def load_manifest(self, manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            files = data.get("files", []) if isinstance(data, dict) else []
        except Exception as exc:
            err = Gtk.Label(label=f"Impossible de lire le manifest: {exc}")
            err.set_xalign(0)
            self.list_box.pack_start(err, False, False, 0)
            return

        if not files:
            empty = Gtk.Label(label="Aucun fichier prêt au dépôt.")
            empty.set_xalign(0)
            self.list_box.pack_start(empty, False, False, 0)
            return

        for item in files:
            row = self.build_row(item)
            self.list_box.pack_start(row["widget"], False, False, 0)
            self.rows.append(row)

        self.show_all()

    def build_row(self, item):
        file_path = os.path.abspath(safe_text(item.get("path")))
        file_name = safe_text(item.get("name")) or os.path.basename(file_path)
        name1 = safe_text(item.get("name1"))
        name2 = safe_text(item.get("name2"))
        description = safe_text(item.get("description"))
        deposited = bool(item.get("deposited", False))

        ebox = Gtk.EventBox()
        row_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        row_box.set_margin_start(4)
        row_box.set_margin_end(4)
        row_box.set_margin_top(6)
        row_box.set_margin_bottom(6)

        def add_col(text, width):
            lbl = Gtk.Label(label=text)
            lbl.set_xalign(0)
            lbl.set_ellipsize(3)
            lbl.set_size_request(width, -1)
            row_box.pack_start(lbl, False, False, 0)

        add_col(file_name, 280)
        add_col(name1, 120)
        add_col(name2, 120)
        add_col(description, 380)

        status_lbl = Gtk.Label(label="Déposé" if deposited else "Prêt")
        status_lbl.set_xalign(0)
        status_lbl.set_size_request(80, -1)
        row_box.pack_start(status_lbl, False, False, 0)

        ebox.add(row_box)

        targets = [Gtk.TargetEntry.new("text/uri-list", 0, 0)]
        ebox.drag_source_set(Gdk.ModifierType.BUTTON1_MASK, targets, Gdk.DragAction.COPY)

        row_state = {
            "widget": ebox,
            "status": status_lbl,
            "file_path": file_path,
            "file_name": file_name,
            "deposited": deposited,
        }

        ebox.connect("drag-data-get", self.on_drag_data_get, row_state)
        ebox.connect("drag-end", self.on_drag_end, row_state)
        self.apply_row_state(row_state)
        return row_state

    def apply_row_state(self, row_state):
        deposited = bool(row_state.get("deposited"))
        row_state["status"].set_text("Déposé" if deposited else "Prêt")
        row_state["widget"].set_sensitive(not deposited)
        row_state["widget"].set_opacity(0.45 if deposited else 1.0)

    def on_drag_data_get(self, _widget, _context, data, _info, _time, row_state):
        if row_state.get("deposited"):
            data.set_uris([])
            return
        uri = GLib.filename_to_uri(row_state["file_path"])
        data.set_uris([uri])

    def on_drag_end(self, _widget, _context, row_state):
        if row_state.get("deposited"):
            return
        row_state["deposited"] = True
        self.apply_row_state(row_state)
        try:
            mark_deposited_in_csv(self.csv_path, row_state["file_name"])
        except Exception:
            pass

signal.signal(signal.SIGTERM, lambda *a: Gtk.main_quit())

if ARGS["mode"] == "single":
    filepath = ARGS["filepath"]
    display_name = ARGS["display_name"]
    if not os.path.isfile(filepath):
        print(f"File not found: {filepath}", file=sys.stderr)
        sys.exit(2)
    win = DragChip(filepath, display_name)
else:
    manifest_path = ARGS["manifest_path"]
    csv_path = ARGS["csv_path"]
    win = BatchDragWindow(manifest_path, csv_path)

win.connect("destroy", Gtk.main_quit)
win.show_all()

Gtk.main()
