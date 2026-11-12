<template>
<!--pages/post/publish 发帖-->
<view class="page">
  <view class="form-card">
    <!-- 吐槽避雷：发帖类型 -->
    <view v-if="category === 'rant'" class="field">
      <view class="field-label">{{L?.typeLabel}}</view>
      <view class="type-row">
        <view v-for="(item, index) in RANT_TYPES" :key="item.id" :class="`type-chip ${rantTypeIndex === index ? 'type-on' : ''}`" :data-index="index" @tap="onRantTypeChange">{{item?.label}}</view>
      </view>
    </view>

    <view class="field">
      <view class="field-label">{{L?.titleLabel}} <text class="req">*</text> <text class="count-tip">{{title?.length}}/100</text></view>
      <input class="field-input" :placeholder="L?.titlePh" placeholder-class="ph" maxlength="100" :value="title" data-field="title" @input="onInput" />
    </view>

    <!-- 互助问答:积分悬赏(只发给被采纳的最佳答案,7 天未采纳退回) + 答谢方式 -->
    <template v-if="category === 'qa'">
      <view class="field">
        <view class="field-label">{{L?.bountyLabel}} <text v-if="myExp !== null" class="my-pts">{{L?.myPointsPrefix}}{{myExp}}</text></view>
        <view class="bounty-row">
          <view v-for="n in BOUNTY_OPTIONS" :key="n" :class="['bounty-chip', bountyExp === n ? 'bounty-on' : '', myExp !== null && n > myExp ? 'bounty-off' : '']" @tap="onPickBounty(n)">{{ n ? n : L?.bountyNone }}</view>
        </view>
        <view class="bounty-tip">{{L?.bountyTip}}</view>
      </view>
      <view class="field">
        <view class="field-label">{{L?.qaThanksLabel}}</view>
        <input class="field-input" :placeholder="L?.qaThanksPh" placeholder-class="ph" maxlength="200" :value="rewardText" data-field="rewardText" @input="onInput" />
      </view>
    </template>

    <!-- 游戏专区:合规提醒 -->
    <view v-if="category === 'game'" class="game-rules">
      <text class="game-rules-t">🎮 {{L?.gameRulesTitle}}</text>
      <text class="game-rules-c">{{L?.gameRules}}</text>
    </view>

    <!-- 美食推荐：结构化字段（店铺名称/美食名称/店铺地址/推荐理由） -->
    <template v-if="category === 'food'">
      <view class="field">
        <view class="field-label">{{L?.storeName}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="L?.storeNamePh" placeholder-class="ph" maxlength="200" :value="storeName" data-field="storeName" @input="onInput" />
      </view>
      <view class="field">
        <view class="field-label">{{L?.foodName}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="L?.foodNamePh" placeholder-class="ph" maxlength="200" :value="foodName" data-field="foodName" @input="onInput" />
      </view>
      <view class="field">
        <view class="field-label">{{L?.storeAddr}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="L?.storeAddrPh" placeholder-class="ph" maxlength="200" :value="storeAddr" data-field="storeAddr" @input="onInput" />
      </view>
      <view class="field">
        <view class="field-label">{{L?.reasonLabel}} <text class="req">*</text> <text class="count-tip">{{reason?.length}}/200</text></view>
        <textarea class="field-textarea" :placeholder="L?.reasonPh" placeholder-class="ph" maxlength="200" :value="reason" data-field="reason" @input="onInput" auto-height />
      </view>
    </template>

    <!-- 失物招领：结构化字段 -->
    <template v-if="category === 'lostfound'">
      <view class="field">
        <view class="field-label">{{L?.categoryLabel}} <text class="req">*</text></view>
        <view class="type-row">
          <view v-for="(item, index) in LOST_TYPES" :key="item.id" :class="`type-chip ${lostTypeIndex === index ? 'type-on' : ''}`" :data-index="index" @tap="onLostTypeChange">{{item?.label}}</view>
        </view>
        <view class="delist-hint">{{lostHint}}</view>
      </view>
      <view class="field">
        <view class="field-label">{{L?.itemName}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="L?.itemNamePh" placeholder-class="ph" maxlength="200" :value="itemName" data-field="itemName" @input="onInput" />
      </view>
      <view class="field">
        <view class="field-label">{{lostType === '招' ? L?.lostTime : L?.foundTime}} <text class="req">*</text></view>
        <view class="deadline-row">
          <picker mode="date" :value="lostTimeDate" @change="onLostTimeDateChange">
            <view :class="`deadline-box ${lostTimeDate ? '' : 'deadline-ph'}`">{{lostTimeDate || L?.selectDate}}</view>
          </picker>
          <picker mode="time" :value="lostTimeTime" @change="onLostTimeTimeChange">
            <view :class="`deadline-box ${lostTimeTime ? '' : 'deadline-ph'}`">{{lostTimeTime || L?.selectTime}}</view>
          </picker>
        </view>
      </view>
      <view class="field">
        <view class="field-label">{{lostType === '招' ? L?.lostPlace : L?.foundPlace}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="L?.placePh" placeholder-class="ph" maxlength="200" :value="location" data-field="location" @input="onInput" />
      </view>
      <view class="field">
        <view class="field-label">{{L?.rewardLabel}} <text class="req">*</text></view>
        <picker mode="selector" :range="REWARD_OPTIONS" range-key="label" :value="rewardIndex" @change="onRewardChange">
          <view :class="`field-picker ${reward ? '' : 'ph'}`">{{rewardDisplay || L?.selectPlaceholder}}</view>
        </picker>
      </view>
      <view v-if="reward === '是'" class="field">
        <view class="field-label">{{L?.rewardAmountLabel}} <text class="req">*</text></view>
        <view class="reward-amount">
          <text class="reward-unit">{{ CUR }}</text>
          <input class="field-input" type="number" :placeholder="L?.amount" placeholder-class="ph" :value="rewardAmount" data-field="rewardAmount" @input="onInput" />
        </view>
      </view>
      <view class="field">
        <view class="field-label">{{L?.contactLabel}} <text class="req">*</text></view>
        <picker mode="selector" :range="CONTACT_OPTIONS" range-key="label" :value="contactTypeIndex" @change="onContactTypeChange">
          <view :class="`field-picker ${contactType ? '' : 'ph'}`">{{contactTypeDisplay || L?.selectPlaceholder}}</view>
        </picker>
      </view>
      <view class="field">
        <view class="field-label">{{L?.contactAccount}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="L?.contactAccountPh" placeholder-class="ph" maxlength="200" :value="contactAccount" data-field="contactAccount" @input="onInput" />
      </view>
    </template>

    <view v-if="category !== 'food' &amp;&amp; category !== 'lostfound'" class="field">
      <view class="field-label">{{L?.contentLabel}} <text class="req">*</text> <text class="count-tip">{{content?.length}}/1000</text></view>
      <textarea class="field-textarea" :placeholder="category === 'treehole' ? L?.contentPhAnon : L?.contentPh" placeholder-class="ph" maxlength="1000" :value="content" data-field="content" @input="onInput" auto-height />
    </view>

    <view class="field">
      <view class="field-label">{{L?.imagesLabel}}</view>
      <view class="img-row">
        <view v-for="(item, index) in images" :key="item" class="img-box">
          <image class="img" :src="item" mode="aspectFill" />
          <view class="img-del" :data-index="index" @tap.stop="onRemoveImage">✕</view>
        </view>
        <view v-if="images?.length < 3" class="img-add" @tap="onChooseImages">＋</view>
      </view>
    </view>
  </view>

  <button class="submit-btn" @tap="onSubmit" :disabled="submitting">
    {{submitting ? L?.publishing : L?.publish}}
  </button>
  <view class="safe-bottom" />
</view>
  <privacy-popup :visible="privacyVisible" @agree="onPrivacyAgree" @reject="onPrivacyReject" />
</template>

<script>
import { definePage } from '@/utils/mp-compat.js';
import appState from '@/utils/app-state.js';
import __m0_app_state from '@/utils/app-state.js';
import __m1_order_meta from '../../utils/order-meta.js';
import __m2_i18n from '../../utils/i18n.js';
import cloud from '@/utils/cloud.js';
import { chooseMedia } from '@/utils/platform.js';
import { localCurrency } from '@/utils/school-data.js';
// pages/post/publish —— 发帖（内容类功能通用；吐槽避雷发帖时选类型）
// 失物招领/美食推荐的结构化字段「拼装成中文内容文本入库」保持原样(历史数据与展示兼容);
// 表单 UI 文案与选项显示按语言本地化,选项 id/存值仍为中文枚举。
const app = __m0_app_state;
const { funcMeta } = __m1_order_meta;
const { t, cloudMsg } = __m2_i18n;

// 类型选项等按当前语言构建（onLoad 注入 data）
const buildPostMeta = () => ({
  RANT_TYPES: [
    { label: t('pp.rantRant'), id: 'rant' },
    { label: t('pp.rantWarning'), id: 'warning' },
  ],
  LOST_TYPES: [
    { label: t('pp.lostSeek'), id: '招' },
    { label: t('pp.lostFound'), id: '领' },
  ],
  LOST_HINTS: [t('pp.lostSeekHint'), t('pp.lostFoundHint')],
  REWARD_OPTIONS: [
    { value: '是', label: t('pp.rewardYes') },
    { value: '否', label: t('pp.rewardNo') },
  ],
  CONTACT_OPTIONS: [
    { value: 'QQ', label: 'QQ' },
    { value: '微信', label: t('pp.contactWechat') },
    { value: '电话', label: t('pp.contactPhone') },
  ],
});

export default definePage({
  data: {
    category: 'rant',
    func: null,
    title: '',
    content: '',
    storeName: '', // 美食推荐：店铺名称
    foodName: '',  // 美食推荐：美食名称
    storeAddr: '', // 美食推荐：店铺地址
    reason: '',    // 美食推荐：推荐理由
    // 失物招领：结构化字段
    LOST_TYPES: [],
    lostTypeIndex: 0,
    lostType: '招',
    lostHint: '',
    itemName: '',
    lostTimeDate: '',
    lostTimeTime: '',
    location: '',
    REWARD_OPTIONS: [],
    rewardIndex: 0,
    reward: '',
    rewardDisplay: '',
    CONTACT_OPTIONS: [],
    contactTypeIndex: 0,
    contactType: '',
    contactTypeDisplay: '',
    contactAccount: '',
    images: [],
    BOUNTY_OPTIONS: [0, 5, 10, 20, 50],
    bountyExp: 0, // 互助问答积分悬赏
    myExp: null,
    rewardAmount: '', // 失物招领奖励金额
    rewardText: '',
    publishType: 'rant', // 吐槽避雷的细分类型
    RANT_TYPES: [],
    rantTypeIndex: 0,
    submitting: false,
    privacyVisible: false,
    CUR: localCurrency(), // 金额符号:中文 ¥ / 其他语言 ₩
    L: {},
  },

  onRantTypeChange(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ rantTypeIndex: i, publishType: this.data.RANT_TYPES[i].id });
  },

  onLoad(options) {
    const category = options.category || 'rant';
    const meta = buildPostMeta();
    const L = {
      typeLabel: t('op.typeLabel'),
      titleLabel: t('op.titleLabel'),
      titlePh: t('pp.titlePh'),
      thanksLabel: t('pp.thanksLabel'),
      amount: t('op.amount'),
      rewardPhEmpty: t('op.rewardPhEmpty'),
      thanksPhOptional: t('pp.thanksPhOptional'),
      storeName: t('pp.storeName'),
      storeNamePh: t('pp.storeNamePh'),
      foodName: t('pp.foodName'),
      foodNamePh: t('pp.foodNamePh'),
      storeAddr: t('pp.storeAddr'),
      storeAddrPh: t('pp.storeAddrPh'),
      reasonLabel: t('pp.reasonLabel'),
      reasonPh: t('pp.reasonPh'),
      categoryLabel: t('pp.categoryLabel'),
      itemName: t('pp.itemName'),
      itemNamePh: t('pp.itemNamePh'),
      lostTime: t('pp.lostTime'),
      foundTime: t('pp.foundTime'),
      lostPlace: t('pp.lostPlace'),
      foundPlace: t('pp.foundPlace'),
      placePh: t('pp.placePh'),
      rewardLabel: t('pp.rewardLabel'),
      rewardAmountLabel: t('pp.rewardAmountLabel'),
      contactLabel: t('pp.contactLabel'),
      contactAccount: t('pp.contactAccount'),
      contactAccountPh: t('pp.contactAccountPh'),
      contentLabel: t('pp.contentLabel'),
      contentPh: t('pp.contentPh'),
      contentPhAnon: t('pp.contentPhAnon'),
      imagesLabel: t('op.imagesLabel'),
      selectPlaceholder: t('common.selectPlaceholder'),
      selectDate: t('common.selectDate'),
      selectTime: t('common.selectTime'),
      publishing: t('common.publishing'),
      publish: t('common.publish'),
    };
    this.setData({
      category,
      func: funcMeta(category),
      ...meta,
      lostHint: meta.LOST_HINTS[0],
      L,
    });
    uni.setNavigationBarTitle({ title: t('nav.postPublish', { name: funcMeta(category).name }) });
    this.setData({
      'L.bountyLabel': t('qa.bountyLabel'), 'L.bountyNone': t('qa.bountyNone'), 'L.bountyTip': t('qa.bountyTip'),
      'L.myPointsPrefix': t('qa.myPoints', { n: '' }), 'L.qaThanksLabel': t('qa.thanksLabel'), 'L.qaThanksPh': t('qa.thanksPh'),
      'L.gameRulesTitle': t('game.rulesTitle'), 'L.gameRules': t('game.rules'),
    });
    if (category === 'qa') {
      cloud.callFunction({ name: 'krstuast', data: { action: 'getMyProfile' } })
        .then((res) => { const u = (res.result || {}).user; if (u) this.setData({ myExp: u.exp || 0 }); })
        .catch(() => {});
    }
    // 失物招领：丢失/捡拾时间默认当前时间
    if (category === 'lostfound') {
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const d = new Date();
      this.setData({
        lostTimeDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        lostTimeTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      });
    }
  },

  onLostTypeChange(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({
      lostTypeIndex: i,
      lostType: this.data.LOST_TYPES[i].id,
      lostHint: this.data.LOST_HINTS[i],
    });
  },

  onLostTimeDateChange(e) {
    this.setData({ lostTimeDate: e.detail.value });
  },

  onLostTimeTimeChange(e) {
    this.setData({ lostTimeTime: e.detail.value });
  },

  onRewardChange(e) {
    const i = Number(e.detail.value);
    const o = this.data.REWARD_OPTIONS[i];
    this.setData({ rewardIndex: i, reward: o.value, rewardDisplay: o.label });
  },

  onPickBounty(n) {
    if (this.data.myExp !== null && n > this.data.myExp) return this.toast(t('qa.myPoints', { n: this.data.myExp }));
    this.setData({ bountyExp: n });
  },

  onContactTypeChange(e) {
    const i = Number(e.detail.value);
    const o = this.data.CONTACT_OPTIONS[i];
    this.setData({ contactTypeIndex: i, contactType: o.value, contactTypeDisplay: o.label });
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onChooseImages() {
    const remain = 3 - this.data.images.length;
    if (remain <= 0) {
      uni.showToast({ title: t('op.maxImages'), icon: 'none' });
      return;
    }
    chooseMedia({
      count: remain,
      mediaType: ['image'],
      success: (res) => {
        uni.showLoading({ title: t('common.uploading') });
        const uploads = res.tempFiles.map((f, i) =>
          cloud.uploadFile({
            cloudPath: `posts/${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}.jpg`,
            filePath: f.tempFilePath,
          })
        );
        Promise.all(uploads)
          .then((rs) => {
            uni.hideLoading();
            this.setData({ images: this.data.images.concat(rs.map((r) => r.fileID)) });
          })
          .catch((e) => {
            uni.hideLoading();
            console.error('upload', e);
            uni.showToast({ title: t('common.uploadFailed'), icon: 'none' });
          });
      },
    });
  },

  onRemoveImage(e) {
    const { index } = e.currentTarget.dataset;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  onSubmit() {
    const d = this.data;
    if (d.submitting) return;
    if (!d.title.trim()) return this.toast(t('pp.titleRequired'));
    // 美食推荐：结构化字段必填，拼装成内容文本入库（存库内容保持中文,勿改）
    let content = d.content;
    if (d.category === 'food') {
      if (!d.storeName.trim()) return this.toast(t('pp.pleaseStoreName'));
      if (!d.foodName.trim()) return this.toast(t('pp.pleaseFoodName'));
      if (!d.storeAddr.trim()) return this.toast(t('pp.pleaseStoreAddr'));
      if (!d.reason.trim()) return this.toast(t('pp.pleaseReason'));
      content = [
        '店铺名称：' + d.storeName.trim(),
        '美食名称：' + d.foodName.trim(),
        '店铺地址：' + d.storeAddr.trim(),
        '推荐理由：' + d.reason.trim(),
      ].join('\n');
    }
    // 失物招领：结构化字段必填，拼装成内容文本入库（存库内容保持中文,勿改）
    if (d.category === 'lostfound') {
      if (!d.itemName.trim()) return this.toast(t('pp.pleaseItemName'));
      if (!d.lostTimeDate || !d.lostTimeTime) return this.toast(t('pp.pleaseTime'));
      if (!d.location.trim()) return this.toast(t('pp.pleasePlace'));
      if (!d.reward) return this.toast(t('pp.pleaseReward'));
      if (d.reward === '是' && !(d.rewardAmount || '').trim()) return this.toast(t('pp.pleaseRewardAmount'));
      if (!d.contactType) return this.toast(t('pp.pleaseContact'));
      if (!d.contactAccount.trim()) return this.toast(t('pp.pleaseContactAccount'));
      const timeLabel = d.lostType === '招' ? '丢失时间' : '捡拾时间';
      const locLabel = d.lostType === '招' ? '丢失地点' : '捡拾地点';
      const lines = [
        '分类：' + (d.lostType === '招' ? '招：丢东西了' : '领：捡东西了'),
        '物品名称：' + d.itemName.trim(),
        timeLabel + '：' + d.lostTimeDate + ' ' + d.lostTimeTime,
        locLabel + '：' + d.location.trim(),
        '奖励：' + d.reward,
      ];
      if (d.reward === '是') lines.push('奖励金额：¥' + d.rewardAmount);
      lines.push('联系方式：' + d.contactType + ' ' + d.contactAccount.trim());
      content = lines.join('\n');
    }
    if (!content.trim()) return this.toast(t('pp.contentRequired'));

    const school = app.readSchool();
    // 吐槽避雷：按用户选的细分类型入库（rant / warning）
    const functionId = d.category === 'rant' ? d.publishType : d.category;
    this.setData({ submitting: true });
    cloud
      .callFunction({
        name: 'krstuast',
        data: {
          action: 'createPost',
          functionId,
          title: d.title,
          content,
          images: d.images,
          rewardAmount: d.category === 'qa' ? '' : d.rewardAmount,
          rewardText: d.rewardText,
          bountyExp: d.category === 'qa' ? d.bountyExp : 0,
          schoolId: school ? school.id : '',
        },
      })
      .then((res) => {
        this.setData({ submitting: false });
        const r = res.result || {};
        if (!r.success) return this.toast(cloudMsg(r.message));
        uni.showToast({ title: t('common.publishedOk'), icon: 'none' });
        uni.redirectTo({ url: '/pages/post/detail?id=' + r.postId });
      })
      .catch((e) => {
        console.error('createPost', e);
        this.setData({ submitting: false });
        this.toast(t('common.networkError'));
      });
  },

  toast(title) {
    uni.showToast({ title, icon: 'none' });
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
});

</script>

<style scoped>
/* pages/post/publish 发帖 */
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 32rpx;
  box-sizing: border-box;
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
.count-tip {
  font-size: 22rpx;
  font-weight: 400;
  color: #8a8494;
  margin-left: 12rpx;
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
.field-textarea {
  width: 100%;
  box-sizing: border-box;
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  min-height: 220rpx;
}
.type-row {
  display: flex;
}
.type-chip {
  padding: 14rpx 36rpx;
  border-radius: 999rpx;
  background: #f6f5f7;
  color: #6e6878;
  font-size: 26rpx;
  font-weight: 600;
  margin-right: 16rpx;
}
.type-on {
  background: #d63a73;
  color: #ffffff;
}
.my-pts { margin-left: 12rpx; font-size: 22rpx; color: #9a93a3; font-weight: 400; }
.bounty-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 12rpx; }
.bounty-chip { min-width: 100rpx; padding: 12rpx 24rpx; border-radius: 32rpx; background: #f1eff3; color: #4a4552; font-size: 26rpx; text-align: center; box-sizing: border-box; }
.bounty-on { background: #d63a73; color: #fff; font-weight: 700; }
.bounty-off { opacity: 0.35; }
.bounty-tip { margin-top: 12rpx; font-size: 22rpx; color: #9a93a3; line-height: 1.5; }
.game-rules { margin: 0 0 24rpx; padding: 22rpx 24rpx; border-radius: 20rpx; background: #eeeafe; display: flex; flex-direction: column; gap: 8rpx; }
.game-rules-t { font-size: 26rpx; font-weight: 700; color: #5b45c2; }
.game-rules-c { font-size: 24rpx; color: #4a4552; line-height: 1.6; }
.reward-row {
  display: flex;
  align-items: center;
}
.reward-amount {
  display: flex;
  align-items: center;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 0 24rpx;
  margin-right: 16rpx;
}
.reward-unit {
  color: #d63a73;
  font-weight: 700;
  margin-right: 8rpx;
}
.reward-amount .field-input {
  background: transparent;
  width: 180rpx;
}
.reward-text {
  flex: 1;
}
.delist-hint {
  font-size: 22rpx;
  color: #b07f2e;
  margin-top: 14rpx;
}
.field-picker {
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
}
.field-picker.ph {
  color: #8a8494;
}
.deadline-row {
  display: flex;
}
.deadline-box {
  min-width: 200rpx;
  text-align: center;
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 28rpx;
  margin-right: 16rpx;
}
.deadline-ph {
  color: #8a8494;
}
.img-row {
  display: flex;
  flex-wrap: wrap;
}
.img-box {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  margin-right: 16rpx;
  margin-bottom: 16rpx;
}
.img {
  width: 100%;
  height: 100%;
  border-radius: 20rpx;
}
.img-del {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  background: #1f1d24;
  color: #ffffff;
  font-size: 22rpx;
  border-radius: 50%;
}
.img-add {
  width: 160rpx;
  height: 160rpx;
  line-height: 156rpx;
  text-align: center;
  font-size: 64rpx;
  color: #8a8494;
  background: #f6f5f7;
  border-radius: 20rpx;
  border: 2rpx dashed #e3dfe7;
  box-sizing: border-box;
}
.submit-btn {
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
.submit-btn[disabled] {
  opacity: 0.6;
}
.safe-bottom {
  height: calc(env(safe-area-inset-bottom) + 24rpx);
}

</style>
