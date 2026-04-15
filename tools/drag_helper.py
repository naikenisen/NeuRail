#!/usr/bin/env python3
"""
Tiny GTK drag-source window — offers a file for DnD with full XDG Desktop Portal
support (application/vnd.portal.filetransfer, etc.).

GTK/GDK automatically registers files with the document portal during drag,
so receiving apps like Storga (C/GTK) get the portal atoms they need.

Usage:  python3 drag_helper.py <filepath> [display_name]
Launched by NeuRail main process. Auto-closes after drag-end or 2 min timeout.
"""
import sys
import os
import signal

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib


if len(sys.argv) < 2:
    print("Usage: drag_helper.py <filepath> [display_name]", file=sys.stderr)
    sys.exit(1)

filepath = os.path.abspath(sys.argv[1])
display_name = sys.argv[2] if len(sys.argv) >= 3 else os.path.basename(filepath)

if not os.path.isfile(filepath):
    print(f"File not found: {filepath}", file=sys.stderr)
    sys.exit(2)


class DragChip(Gtk.Window):
    def __init__(self):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.set_title("NeuRail — Glisser le fichier")
        self.set_keep_above(True)
        self.set_default_size(360, 64)
        self.set_resizable(False)
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)

        # EventBox has its own GdkWindow → receives mouse events for drag
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
        label.set_markup(f"<b>⬆ Glisse-moi dans Storga</b>\n<small>{GLib.markup_escape_text(display_name)}</small>")
        label.set_ellipsize(3)  # PANGO_ELLIPSIZE_END
        label.set_max_width_chars(45)
        label.set_xalign(0)
        box.pack_start(label, True, True, 0)

        ebox.add(box)
        self.add(ebox)

        # Set up drag source on the EventBox with text/uri-list —
        # GTK/GDK will automatically add portal atoms in a portal-aware session.
        targets = [
            Gtk.TargetEntry.new("text/uri-list", 0, 0),
        ]
        ebox.drag_source_set(
            Gdk.ModifierType.BUTTON1_MASK,
            targets,
            Gdk.DragAction.COPY,
        )
        ebox.connect("drag-data-get", self.on_drag_data_get)
        ebox.connect("drag-end", self.on_drag_end)

    def on_drag_data_get(self, widget, context, data, info, time):
        uri = GLib.filename_to_uri(filepath)
        data.set_uris([uri])

    def on_drag_end(self, widget, context):
        # Close after successful drag
        GLib.timeout_add(300, Gtk.main_quit)


signal.signal(signal.SIGTERM, lambda *a: Gtk.main_quit())

win = DragChip()
win.connect("destroy", Gtk.main_quit)
win.show_all()

# Auto-close after 2 minutes
GLib.timeout_add_seconds(120, Gtk.main_quit)

Gtk.main()
