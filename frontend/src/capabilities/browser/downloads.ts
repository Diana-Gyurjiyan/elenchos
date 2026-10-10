import type { DownloadsPort } from "../../types";

export const browserDownloads: DownloadsPort = {
  async save({ filename, data, mime = "text/plain;charset=utf-8" }) {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
