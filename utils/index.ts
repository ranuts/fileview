import { md5 } from "ranuts/utils";

const loadedScripts = new Set<string>();

export const loadScript = ({ type, content }: { type: string; content: string }): Promise<{ success: boolean }> => {
    return new Promise((resolve, reject) => {
      // Generate a unique key for the script using MD5
      const scriptKey = md5(content);
  
      // Check if script is already loaded
      if (loadedScripts.has(scriptKey)) {
        resolve({ success: true });
        return;
      }
  
      const script = document.createElement('script');
      if (type === 'url') {
        script.src = content;
      }
      if (type === 'content') {
        script.textContent = content;
      }
      script.onload = function () {
        loadedScripts.add(scriptKey);
        resolve({ success: true });
      };
      script.onerror = function (error) {
        reject({ success: false, error });
      };
      document.body.append(script);
    });
  };