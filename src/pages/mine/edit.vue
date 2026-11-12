<template>
<!--pages/mine/edit 编辑资料-->
<view class="page">
  <!-- 隐藏画布：头像压缩用 -->
  <canvas canvas-id="avatarCanvas" class="avatar-canvas" />
  <view class="form-card">
    <view class="field">
      <view class="field-label">{{L?.avatar}}</view>
      <!-- #ifdef MP-WEIXIN -->
      <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image class="avatar" :src="avatarUrl || defaultAvatar" mode="aspectFill" />
        <view class="avatar-edit">📷</view>
      </button>
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <view class="avatar-btn" @tap="onPickAvatarApp">
        <image class="avatar" :src="avatarUrl || defaultAvatar" mode="aspectFill" />
        <view class="avatar-edit">📷</view>
      </view>
      <!-- #endif -->
    </view>

    <view class="field">
      <view class="field-label">{{L?.nickname}} <text class="req">*</text></view>
      <input class="field-input" type="nickname" :placeholder="L?.nicknamePh" placeholder-class="ph" maxlength="20" :value="form?.nickname" data-field="nickname" @input="onInput" />
    </view>

    <view class="field">
      <view class="field-label">{{L?.schoolLabel}}</view>
      <view class="field-readonly">{{schoolText}}</view>
    </view>

    <view class="field">
      <view class="field-label">{{L?.uidLabel}}</view>
      <view class="uid-row" @tap="onCopyUid" hover-class="uid-hover">
        <text class="uid-text">{{uid || L?.loading}}</text>
        <text class="uid-copy">📋</text>
      </view>
    </view>

    <view class="field">
      <view class="field-label">{{L?.major}}</view>
      <input class="field-input" :placeholder="L?.majorPh" placeholder-class="ph" maxlength="200" :value="form?.major" data-field="major" @input="onInput" />
    </view>

    <view class="field">
      <view class="field-label">{{L?.age}}</view>
      <input class="field-input" type="number" :placeholder="L?.agePh" placeholder-class="ph" :value="form?.age" data-field="age" @input="onInput" />
    </view>

    <view class="field">
      <view class="field-label">{{L?.gender}}</view>
      <picker mode="selector" :range="genderLabels" :value="genderIndex < 0 ? 0 : genderIndex" @change="onGenderChange">
        <view :class="`field-picker ${form?.gender ? '' : 'ph'}`">{{formDisplay?.gender || L?.selectGender}}</view>
      </picker>
    </view>

    <view class="field">
      <view class="field-label">{{L?.hometown}}</view>
      <picker mode="region" @change="onHometownChange">
        <view :class="`field-picker ${form?.hometown ? '' : 'ph'}`">{{form?.hometown || L?.selectHometown}}</view>
      </picker>
    </view>

    <view class="field">
      <view class="field-label">{{L?.relationship}}</view>
      <picker mode="selector" :range="relationshipLabels" :value="relationshipIndex < 0 ? 0 : relationshipIndex" @change="onRelationshipChange">
        <view :class="`field-picker ${form?.relationship ? '' : 'ph'}`">{{formDisplay?.relationship || L?.selectRelationship}}</view>
      </picker>
    </view>

    <view class="field">
      <view class="field-label">{{L?.signature}}</view>
      <textarea class="field-textarea" :placeholder="L?.signaturePh" placeholder-class="ph" maxlength="60" :value="form?.signature" data-field="signature" @input="onInput" auto-height />
    </view>
  </view>

  <button class="save-btn" @tap="onSave" :disabled="saving">
    {{saving ? L?.saving : L?.save}}
  </button>
  <view class="safe-bottom" />

  <view :class="`to-top ${showTop ? 'to-top-show' : ''}`" @tap="onToTop" hover-class="to-top-hover">⬆</view>
</view>
  <privacy-popup :visible="privacyVisible" @agree="onPrivacyAgree" @reject="onPrivacyReject" />
</template>

<script>
import { definePage } from '@/utils/mp-compat.js';
import appState from '@/utils/app-state.js';
import __m0_app_state from '@/utils/app-state.js';
import __m1_i18n from '../../utils/i18n.js';
import cloud from '@/utils/cloud.js';
// pages/mine/edit —— 个人资料编辑（昵称/专业/年龄/性别/故乡/性取向/婚恋情况/签名）
// 选项为 {value: 存库中文枚举, label: 本地化显示};写库用 value,展示/回显用 label。
// 存值比较(u.nickname === '微信用户'、orientation !== '同性恋')保持中文字面量,勿改。
const app = __m0_app_state;
const { t, tv, cloudMsg, localizedSchool } = __m1_i18n;

// 选项构建:value 为存库枚举(zh 下的中文),label 经 tv() 本地化
const buildOptions = () => {
  const P = (mapName, values) => values.map((v) => ({ value: v, label: tv(mapName, v) }));
  return {
    gender: P('userGender', ['男', '女', '保密']),
    orientation: P('orientation', ['异性恋', '同性恋', '双性恋', '其他', '保密']),
    relationship: P('relationship', ['单身', '恋爱中', '已婚', '离异', '保密']),
    roleAttr: P('roleAttr', ['top', 'btm', 'vers', 'side', 'other']),
  };
};

export default definePage({
  data: {
    school: null,   // 只读展示
    uid: '',        // 用户短 ID（只读展示）
    avatarUrl: '',  // 头像（可换）
    schoolText: '',
    defaultAvatar: '/static/avatar-default.png', // 1x1 透明占位，避免包内大图
    form: {
      nickname: '',
      major: '',
      age: '',
      gender: '',
      hometown: '',
      orientation: '',
      roleAttr: '',
      relationship: '',
      signature: '',
    },
    formDisplay: { gender: '', orientation: '', roleAttr: '', relationship: '' },
    OPTIONS: { gender: [], orientation: [], relationship: [], roleAttr: [] },
    genderLabels: [], orientationLabels: [], relationshipLabels: [], roleAttrLabels: [],
    genderIndex: -1,
    orientationIndex: -1,
    relationshipIndex: -1,
    roleAttrIndex: -1,
    saving: false,
    L: {},
  },

  onLoad() {
    this.applyI18n();
    this.load();
  },

  onShow() {
    // 语言切换靠 reLaunch 全站重建,这里也兜底刷新(onShow 先于 onLoad 首次也会跑)
    this.applyI18n();
  },

  applyI18n() {
    const OPTIONS = buildOptions();
    const L = {
      avatar: t('mineEdit.avatar'),
      nickname: t('mineEdit.nickname'),
      nicknamePh: t('mineEdit.nicknamePh'),
      schoolLabel: t('mineEdit.schoolLabel'),
      uidLabel: t('mineEdit.uidLabel'),
      unselected: t('mineEdit.unselected'),
      loading: t('common.loading'),
      major: t('mineEdit.major'),
      majorPh: t('mineEdit.majorPh'),
      age: t('mineEdit.age'),
      agePh: t('mineEdit.agePh'),
      gender: t('mineEdit.gender'),
      selectGender: t('mineEdit.selectGender'),
      hometown: t('mineEdit.hometown'),
      selectHometown: t('mineEdit.selectHometown'),
      orientation: t('mineEdit.orientation'),
      selectOrientation: t('mineEdit.selectOrientation'),
      roleAttr: t('mineEdit.roleAttr'),
      selectRoleAttr: t('mineEdit.selectRoleAttr'),
      relationship: t('mineEdit.relationship'),
      selectRelationship: t('mineEdit.selectRelationship'),
      signature: t('mineEdit.signature'),
      signaturePh: t('mineEdit.signaturePh'),
      saving: t('common.saving'),
      save: t('common.save'),
    };
    uni.setNavigationBarTitle({ title: t('nav.mineEdit') });
    this.setData({
      L,
      OPTIONS,
      genderLabels: OPTIONS.gender.map((o) => o.label),
      orientationLabels: OPTIONS.orientation.map((o) => o.label),
      relationshipLabels: OPTIONS.relationship.map((o) => o.label),
      roleAttrLabels: OPTIONS.roleAttr.map((o) => o.label),
    });
  },

  load() {
    cloud
      .callFunction({ name: 'krstuast', data: { action: 'getMyProfile' } })
      .then((res) => {
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        const u = r.user;
        const form = {
          nickname: u.nickname === '微信用户' ? '' : u.nickname,
          major: u.major || '',
          age: u.age ? String(u.age) : '',
          gender: u.gender || '',
          hometown: u.hometown || '',
          orientation: u.orientation || '',
          roleAttr: u.roleAttr || '',
          relationship: u.relationship || '',
          signature: u.signature || '',
        };
        const school = app.readSchool();
        const loc = localizedSchool(school);
        const OPTIONS = this.data.OPTIONS;
        const formDisplay = {
          gender: tv('userGender', form.gender),
          orientation: tv('orientation', form.orientation),
          roleAttr: tv('roleAttr', form.roleAttr),
          relationship: tv('relationship', form.relationship),
        };
        this.setData({
          school,
          schoolText: school ? loc.nameMain + ' · ' + loc.nameSub : t('mineEdit.unselected'),
          uid: u.uid || '',
          avatarUrl: u.avatarUrl || '',
          form,
          formDisplay,
          genderIndex: OPTIONS.gender.findIndex((o) => o.value === form.gender),
          orientationIndex: OPTIONS.orientation.findIndex((o) => o.value === form.orientation),
          relationshipIndex: OPTIONS.relationship.findIndex((o) => o.value === form.relationship),
          roleAttrIndex: OPTIONS.roleAttr.findIndex((o) => o.value === form.roleAttr),
        });
      })
      .catch((e) => {
        console.error('edit load', e);
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
      });
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  onGenderChange(e) {
    const i = Number(e.detail.value);
    const o = this.data.OPTIONS.gender[i];
    if (!o) return;
    this.setData({ genderIndex: i, 'form.gender': o.value, 'formDisplay.gender': o.label });
  },
  // 故乡：微信内置省市区级联选择器（返回中文地名，按原文保存/展示）
  onHometownChange(e) {
    const v = e.detail.value || [];
    this.setData({ 'form.hometown': v.join(' ') });
  },
  onOrientationChange(e) {
    const i = Number(e.detail.value);
    const o = this.data.OPTIONS.orientation[i];
    if (!o) return;
    // 不是同性恋时清空属性标签（比较存值「同性恋」，勿改）
    const patch = { orientationIndex: i, 'form.orientation': o.value, 'formDisplay.orientation': o.label };
    if (o.value !== '同性恋') {
      patch['form.roleAttr'] = '';
      patch['formDisplay.roleAttr'] = '';
      patch.roleAttrIndex = -1;
    }
    this.setData(patch);
  },

  onRoleAttrChange(e) {
    const i = Number(e.detail.value);
    const o = this.data.OPTIONS.roleAttr[i];
    if (!o) return;
    this.setData({ roleAttrIndex: i, 'form.roleAttr': o.value, 'formDisplay.roleAttr': o.label });
  },
  onRelationshipChange(e) {
    const i = Number(e.detail.value);
    const o = this.data.OPTIONS.relationship[i];
    if (!o) return;
    this.setData({ relationshipIndex: i, 'form.relationship': o.value, 'formDisplay.relationship': o.label });
  },

  // 用户 ID 只读，点按复制
  onCopyUid() {
    if (!this.data.uid) return;
    uni.setClipboardData({
      data: this.data.uid,
      success: () => uni.showToast({ title: t('common.copied'), icon: 'none' }),
    });
  },

  // App/H5:没有微信头像选择器,改为相册/拍照选图,再走同一套压缩上传流程
  onPickAvatarApp() {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => this.onChooseAvatar({ detail: { avatarUrl: res.tempFilePaths[0] } }),
    });
  },

  // 更换头像（canvas 压缩 240×240 → 上传 → 更新资料 → 清理旧图）
  onChooseAvatar(e) {
    const temp = e.detail.avatarUrl;
    if (!temp) return;
    uni.showLoading({ title: t('common.uploading') });
    this.compressAvatar(temp)
      .then((compressed) =>
        cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}-${Math.floor(Math.random() * 100000)}.jpg`,
          filePath: compressed,
        })
      )
      .then((r) => {
        uni.hideLoading();
        const oldFileID = this.data.avatarUrl || '';
        const update = cloud.callFunction({
          name: 'krstuast',
          data: { action: 'updateProfile', avatarUrl: r.fileID },
        });
        const cleanup = cloud.isCloudFile(oldFileID)
          ? cloud.deleteFile({ fileList: [oldFileID] }).catch(() => {})
          : Promise.resolve();
        return Promise.all([update, cleanup]).then((rs) => rs[0]);
      })
      .then((res) => {
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        this.load();
      })
      .catch(() => {
        uni.hideLoading();
        uni.showToast({ title: t('common.avatarUploadFailed'), icon: 'none' });
      });
  },

  compressAvatar(src) {
    return new Promise((resolve) => {
      uni.getImageInfo({
        src,
        success: (info) => {
          const ctx = uni.createCanvasContext('avatarCanvas', this);
          ctx.drawImage(info.path, 0, 0, 240, 240);
          ctx.draw(false, () => {
            uni.canvasToTempFilePath(
              {
                canvasId: 'avatarCanvas',
                x: 0,
                y: 0,
                width: 240,
                height: 240,
                destWidth: 240,
                destHeight: 240,
                fileType: 'jpg',
                quality: 0.85,
                success: (r) => resolve(r.tempFilePath),
                fail: () => resolve(src),
              },
              this
            );
          });
        },
        fail: () => resolve(src),
      });
    });
  },

  onSave() {
    const f = this.data.form;
    if (this.data.saving) return;
    if (!f.nickname.trim()) return uni.showToast({ title: t('mineEdit.nicknameRequired'), icon: 'none' });
    if (f.age && (isNaN(Number(f.age)) || !Number.isInteger(Number(f.age)))) {
      return uni.showToast({ title: t('mineEdit.ageInteger'), icon: 'none' });
    }
    this.setData({ saving: true });
    cloud
      .callFunction({
        name: 'krstuast',
        data: {
          action: 'updateProfile',
          nickname: f.nickname,
          major: f.major,
          age: f.age,
          gender: f.gender,
          hometown: f.hometown,
          relationship: f.relationship,
          signature: f.signature,
          schoolId: this.data.school ? this.data.school.id : '',
        },
      })
      .then((res) => {
        this.setData({ saving: false });
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        uni.showToast({ title: t('common.savedOk'), icon: 'none' });
        setTimeout(() => uni.navigateBack(), 600);
      })
      .catch((e) => {
        console.error('updateProfile', e);
        this.setData({ saving: false });
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
      });
  },

  // ---------- 隐私弹窗 ----------
  openPrivacyPopup() {
    this.setData({ privacyVisible: true });
  },
  onPrivacyAgree() {
    this.setData({ privacyVisible: false });
    appState.resolvePrivacy(true);
  },
  onPrivacyReject() {
    this.setData({ privacyVisible: false });
    appState.resolvePrivacy(false);
  },

  // 回到顶部按钮：页面下滑时出现
  onPageScroll(e) {
    const showTop = e.scrollTop > 500;
    if (showTop !== this.data.showTop) this.setData({ showTop });
  },

  onToTop() {
    uni.pageScrollTo({ scrollTop: 0, duration: 300 });
    this.setData({ showTop: false });
  },
});

</script>

<style scoped>
/* pages/mine/edit 编辑资料 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 32rpx;
  box-sizing: border-box;
}
.avatar-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 240px;
  height: 240px;
}
.avatar-btn {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  padding: 0;
  background: transparent;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #ffeef4;
}
.avatar-edit {
  position: absolute;
  right: -4rpx;
  bottom: -4rpx;
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  text-align: center;
  font-size: 24rpx;
  background: #d63a73;
  border-radius: 50%;
  border: 4rpx solid #ffffff;
}
.form-card {
  background: #ffffff;
  border-radius: 32rpx;
  padding: 8rpx 32rpx;
  box-shadow: 0 12rpx 32rpx rgba(31, 29, 36, 0.06);
}
.field {
  padding: 26rpx 0;
  border-bottom: 2rpx solid #f3f1f5;
}
.field:last-child {
  border-bottom: none;
}
.field-label {
  font-size: 28rpx;
  font-weight: 700;
  color: #1f1d24;
  margin-bottom: 16rpx;
}
.req {
  color: #d63a73;
}
.field-input {
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  min-height: 40rpx;
  height: auto;
}
.ph {
  color: #8a8494;
}
.field-readonly {
  font-size: 28rpx;
  color: #6e6878;
  background: #f3f1f5;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
}
.uid-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
}
.uid-hover {
  opacity: 0.8;
}
.uid-text {
  font-size: 28rpx;
  color: #1f1d24;
  font-weight: 600;
  letter-spacing: 2rpx;
}
.uid-copy {
  font-size: 28rpx;
}
.field-picker {
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
}
.field-textarea {
  width: 100%;
  box-sizing: border-box;
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  min-height: 120rpx;
}
.save-btn {
  margin-top: 40rpx;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 999rpx;
  background: #d63a73;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 700;
  box-shadow: 0 12rpx 32rpx rgba(31, 29, 36, 0.08);
}
.save-btn[disabled] {
  opacity: 0.6;
}
.safe-bottom {
  height: calc(env(safe-area-inset-bottom) + 24rpx);
}

.to-top {
  position: fixed;
  right: calc(48rpx + var(--k-side, 0px));
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 80rpx;
  height: 80rpx;
  line-height: 76rpx;
  text-align: center;
  font-size: 40rpx;
  color: #d63a73;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 8rpx 24rpx rgba(31, 29, 36, 0.08);
  opacity: 0;
  transform: translateY(20rpx);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 60;
}
.to-top-show {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.to-top-hover {
  opacity: 0.8;
}

</style>
