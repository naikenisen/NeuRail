#!/usr/bin/env python3
"""
Diagnostic XDnD : ouvre une fenêtre drop-target qui log TOUS les types et données
reçus lors d'un glisser-déposer. Utilisé pour comparer Nautilus vs Electron.

Usage:
  python3 tools/drop_diagnostic.py

Puis glisse un fichier depuis :
  1) Nautilus (GNOME Fichiers)
  2) NeuRail (Electron)

Compare les logs dans le terminal.
"""
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk


class DropDiag(Gtk.Window):
    def __init__(self):
        super().__init__(title="Drop Diagnostic — XDnD")
        self.set_default_size(500, 300)
        label = Gtk.Label(
            label="Glisse un fichier ici.\n\n"
                  "Les types XDnD et données reçus seront affichés dans le terminal."
        )
        label.set_line_wrap(True)
        self.add(label)

        # Accept ANY drop — don't restrict targets
        self.drag_dest_set(0, [], Gdk.DragAction.COPY | Gdk.DragAction.MOVE)
        self.connect("drag-motion", self.on_motion)
        self.connect("drag-drop", self.on_drop)
        self.connect("drag-data-received", self.on_data)
        self._logged_motion = False

    def on_motion(self, widget, context, x, y, time):
        targets = [str(t) for t in context.list_targets()]
        if not self._logged_motion:
            print(f"\n{'='*60}")
            print(f"[DRAG MOTION] {len(targets)} targets offered:")
            for t in targets:
                print(f"    {t}")
            self._logged_motion = True
        Gdk.drag_status(context, Gdk.DragAction.COPY, time)
        return True

    def on_drop(self, widget, context, x, y, time):
        self._logged_motion = False
        targets = context.list_targets()
        print(f"\n[DROP] Requesting data for {len(targets)} targets:")
        for t in targets:
            print(f"  -> requesting: {t}")
            widget.drag_get_data(context, t, time)
        return True

    def on_data(self, widget, context, x, y, data, info, time):
        target = data.get_target()
        print(f"\n  [DATA for '{target}']")
        try:
            text = data.get_text()
            if text:
                print(f"    get_text(): {text[:300]}")
        except Exception:
            pass
        try:
            uris = data.get_uris()
            if uris:
                print(f"    get_uris(): {uris}")
        except Exception:
            pass
        try:
            raw = data.get_data()
            if raw:
                decoded = raw.decode('utf-8', errors='replace')[:300]
                print(f"    raw ({len(raw)} bytes): {decoded}")
        except Exception:
            pass
        Gtk.drag_finish(context, True, False, time)


win = DropDiag()
win.connect("destroy", Gtk.main_quit)
win.show_all()
Gtk.main()
