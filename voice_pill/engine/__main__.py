"""CLI entry: python -m voice_pill.engine"""

import multiprocessing

from voice_pill.engine.server import main

if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
