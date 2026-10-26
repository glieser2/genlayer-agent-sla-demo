"""Narrow test-harness workaround for Windows open-file deletion semantics.

gltest.direct injects stdin, then unlinks its still-open temporary file.
Windows rejects that unlink; defer it until the VM restores stdin.
Contract behavior and SDK decision validation are not replaced.
"""
import os
from pathlib import Path
import tempfile
from gltest.direct import loader

_deferred = []


def enable_windows_compat():
    if os.name != "nt" or getattr(loader, "_sla_windows_adapter", False):
        return
    original = loader._inject_message_to_fd0

    def inject(vm):
        try:
            original(vm)
        except PermissionError as error:
            # Only the known unlink failure, after the fd0 injection succeeded.
            trace = error.__traceback__
            while trace.tb_next is not None:
                trace = trace.tb_next
            path = Path(error.filename).resolve() if error.filename else None
            if (error.winerror != 32 or path is None
                    or path.parent != Path(tempfile.gettempdir()).resolve()
                    or trace.tb_frame.f_code.co_name != "_inject_message_to_fd0"):
                raise
            _deferred.append(path)
    loader._inject_message_to_fd0 = inject
    loader._sla_windows_adapter = True


def cleanup_deferred():
    while _deferred:
        path = _deferred.pop()
        # Exact files created by this test library invocation only.
        path.unlink(missing_ok=True)
