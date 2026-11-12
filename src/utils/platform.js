// utils/platform.js —— 跨端差异封装
//
// chooseMedia:小程序用 wx.chooseMedia;App/H5 用 uni.chooseImage 并把返回值
// 转换为 chooseMedia 的结构 { tempFiles: [{ tempFilePath, size }] },页面代码无需改动。
export function chooseMedia(opts) {
  // #ifdef MP-WEIXIN
  return uni.chooseMedia(opts);
  // #endif
  // #ifndef MP-WEIXIN
  const { count = 9, success, fail, complete } = opts || {};
  return uni.chooseImage({
    count,
    sizeType: ['compressed'],
    sourceType: (opts && opts.sourceType) || ['album', 'camera'],
    success: (res) => {
      const files = (res.tempFiles || []).map((f, i) => ({
        tempFilePath: f.path || res.tempFilePaths[i],
        size: f.size || 0,
        fileType: 'image',
      }));
      if (!files.length && res.tempFilePaths) res.tempFilePaths.forEach((p) => files.push({ tempFilePath: p, size: 0, fileType: 'image' }));
      success && success({ tempFiles: files, type: 'image' });
    },
    fail,
    complete,
  });
  // #endif
}

export const isMp = () => {
  // #ifdef MP-WEIXIN
  return true;
  // #endif
  // #ifndef MP-WEIXIN
  return false;
  // #endif
};
