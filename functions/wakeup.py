from google.colab import drive
import sys
import os

def start():
    """Mounts Drive and connects the AppStore logic."""
    if not os.path.exists('/content/drive'):
        drive.mount('/content/drive')
    
    # Path to your shared drive
    root = '/content/drive/Shared drives/finance and legal/Programs'
    
    # Add functions folder to the path so you can import other files
    func_path = f"{root}/functions"
    if func_path not in sys.path:
        sys.path.append(func_path)
    
    print("🚀 Voyage AppStore: Engine Started")
    return root