<template>
<!--pages/order/publish 发布任务（按分类动态渲染）-->
<view class="page">
  <view class="form-card">
    <!-- 帮取帮送：任务类型 -->
    <view v-if="category === 'pickup'" class="field">
      <view class="field-label">{{L?.typeLabel}}</view>
      <view class="type-row">
        <view v-for="(item, index) in TASK_TYPES" :key="item.id" :class="`type-chip ${taskTypeIndex === index ? 'type-on' : ''}`" :data-index="index" @tap="onTaskTypeChange">{{item?.label}}</view>
      </view>
    </view>

    <!-- 拆单凑单：类型（拆单=买多找人分；凑单=凑满减凑包邮） -->
    <view v-if="category === 'groupbuy'" class="field">
      <view class="field-label">{{L?.typeLabel}} <text class="req">*</text></view>
      <view class="type-row">
        <view v-for="(item, index) in GROUPBUY_TYPES" :key="item.id" :class="`type-chip ${gbTypeIndex === index ? 'type-on' : ''}`" :data-index="index" @tap="onGbTypeChange">{{item?.label}}</view>
      </view>
      <view class="delist-hint">
        {{gbTypeIndex === 0 ? L?.gbHintSplit : L?.gbHintJoin}}
      </view>
    </view>

    <!-- 租房：类型（求租 / 转租 / 出租，同帮取帮送的胶囊选择） -->
    <view v-if="category === 'housing'" class="field">
      <view class="field-label">{{L?.typeLabel}} <text class="req">*</text></view>
      <view class="type-row">
        <view v-for="(item, index) in HOUSING_TYPES" :key="item.id" :class="`type-chip ${housingTypeIndex === index ? 'type-on' : ''}`" :data-index="index" @tap="onHousingTypeChange">{{item?.label}}</view>
      </view>
      <view class="delist-hint">{{housingHint}}</view>
    </view>

    <!-- 兼职：类型（找兼职 / 招兼职，同帮取帮送的胶囊选择） -->
    <view v-if="category === 'parttime'" class="field">
      <view class="field-label">{{L?.typeLabel}} <text class="req">*</text></view>
      <view class="type-row">
        <view v-for="(item, index) in PARTTIME_TYPES" :key="item.id" :class="`type-chip ${parttimeTypeIndex === index ? 'type-on' : ''}`" :data-index="index" @tap="onParttimeTypeChange">{{item?.label}}</view>
      </view>
      <view class="delist-hint">{{parttimeHint}}</view>
    </view>

    <!-- 私厨点菜：类型（做菜 / 点菜，同帮取帮送的胶囊选择） -->
    <view v-if="category === 'homecook'" class="field">
      <view class="field-label">{{L?.typeLabel}} <text class="req">*</text></view>
      <view class="type-row">
        <view v-for="(item, index) in HOMECOOK_TYPES" :key="item.id" :class="`type-chip ${homecookTypeIndex === index ? 'type-on' : ''}`" :data-index="index" @tap="onHomecookTypeChange">{{item?.label}}</view>
      </view>
      <view class="delist-hint">{{homecookHint}}</view>
    </view>

    <view v-if="!cfg?.noTitle" class="field">
      <view class="field-label">{{L?.titleLabel}} <text class="req">*</text> <text class="count-tip">{{title?.length}}/15</text></view>
      <input class="field-input" :placeholder="L?.titlePh" placeholder-class="ph" maxlength="200" :value="title" data-field="title" @input="onInput" />
    </view>

    <!-- 分类专属字段 -->
    <template v-for="(f, fi) in cfg?.extras" :key="f.key">
      <view v-if="!f?.formHidden &amp;&amp; (!f?.showWhen || extraValues?.[f?.showWhen?.key] === f?.showWhen?.value)" class="field">
        <view class="field-label">{{f?.label}} <text v-if="f?.required" class="req">*</text></view>
        <picker v-if="f?.type === 'picker'" mode="selector" :range="f?.optionLabels" :value="extraIndexes?.[f?.key] < 0 ? 0 : extraIndexes?.[f?.key]" :data-key="f?.key" :data-index="fi" @change="onExtraPickerChange">
          <view :class="`field-picker ${extraValues?.[f?.key] ? '' : 'ph'}`">{{extraDisplay?.[f?.key] || L?.selectPlaceholder}}</view>
        </picker>
        <!-- 日期单选（如拼好饭，不带时间） -->
        <picker v-else-if="f?.type === 'date'" mode="date" :value="extraDates?.[f?.key]" :data-key="f?.key" @change="onExtraDateChange">
          <view :class="`deadline-box ${extraDates?.[f?.key] ? '' : 'deadline-ph'}`">{{extraDates?.[f?.key] || L?.selectDate}}</view>
        </picker>
        <!-- 日期+时间双下拉（如出行信息出发时间） -->
        <template v-else-if="f?.type === 'datetime'">
          <view class="deadline-row">
            <picker mode="date" :value="extraDates?.[f?.key]" :data-key="f?.key" @change="onExtraDateChange">
              <view :class="`deadline-box ${extraDates?.[f?.key] ? '' : 'deadline-ph'}`">{{extraDates?.[f?.key] || L?.selectDate}}</view>
            </picker>
            <picker mode="time" :value="extraTimes?.[f?.key]" :data-key="f?.key" @change="onExtraTimeChange">
              <view :class="`deadline-box ${extraTimes?.[f?.key] ? '' : 'deadline-ph'}`">{{extraTimes?.[f?.key] || L?.selectTime}}</view>
            </picker>
            <text v-if="f?.ph" class="extra-hint">{{f?.ph}}</text>
          </view>
        </template>
        <textarea v-else-if="f?.type === 'textarea'" class="field-textarea" :placeholder="f?.ph" placeholder-class="ph" :maxlength="f?.max || 100" :value="extraValues?.[f?.key]" :data-key="f?.key" @input="onExtraInput" auto-height />
        <!-- 合并行（兼职）：金额/时长 + 单位同一行（配置驱动 unitKey/unitOptions） -->
        <view v-else-if="f?.type === 'payRow'" class="reward-row">
          <view class="reward-amount">
            <text class="reward-unit">{{f?.unitSymbol || ''}}</text>
            <input class="field-input" type="number" data-num="d" :placeholder="f?.ph || L?.amount" placeholder-class="ph" :value="extraValues?.[f?.key]" :data-key="f?.key" @input="onExtraInput" />
          </view>
          <picker v-if="f?.unitType !== 'input'" class="pay-unit" mode="selector" :range="f?.unitOptionLabels" :value="extraIndexes?.[f?.unitKey] < 0 ? 0 : extraIndexes?.[f?.unitKey]" :data-unit-key="f?.unitKey" @change="onUnitChange">
            <view :class="`field-picker ${extraValues?.[f?.unitKey] ? '' : 'ph'}`">{{extraDisplay?.[f?.unitKey] || f?.unitPh || L?.selectPlaceholder}}</view>
          </picker>
          <!-- 单位支持自由输入（如 每次 / 每小时 / 每3次 / 每2小时） -->
          <input v-else class="field-input pay-unit" :placeholder="f?.unitPh" placeholder-class="ph" placeholder-style="font-size: 22rpx" :maxlength="f?.max || 10" :value="extraValues?.[f?.unitKey]" :data-key="f?.unitKey" @input="onExtraInput" />
        </view>
        <!-- 价格合并行（陪玩陪聊）：金额 每 N 次/小时 -->
        <view v-else-if="f?.type === 'priceRow'" class="reward-row price-row">
          <view class="reward-amount">
            <text class="reward-unit">{{ CUR }}</text>
            <input class="field-input" type="number" data-num="d" :placeholder="L?.amount" placeholder-class="ph" :value="extraValues?.[f?.key]" :data-key="f?.key" @input="onExtraInput" />
          </view>
          <text class="per-word">{{L?.perWord}}</text>
          <input class="field-input price-n" type="number" data-num="i" :placeholder="f?.countPh" placeholder-class="ph" placeholder-style="font-size: 20rpx" :value="extraValues?.[f?.countKey]" :data-key="f?.countKey" @input="onExtraInput" />
          <picker class="pay-unit" mode="selector" :range="f?.unitOptionLabels" :value="extraIndexes?.[f?.unitKey] < 0 ? 0 : extraIndexes?.[f?.unitKey]" :data-unit-key="f?.unitKey" @change="onUnitChange">
            <view :class="`field-picker ${extraValues?.[f?.unitKey] ? '' : 'ph'}`">{{extraDisplay?.[f?.unitKey] || f?.unitPh}}</view>
          </picker>
        </view>
        <input v-else class="field-input" :type="f?.type === 'number' ? 'number' : 'text'" :placeholder="f?.ph" placeholder-class="ph" :maxlength="f?.max || 20" :value="extraValues?.[f?.key]" :data-key="f?.key" @input="onExtraInput" />
      </view>
    </template>

    <view v-if="!cfg?.noDesc" class="field">
      <view class="field-label">{{L?.descLabel}} <text class="count-tip">{{desc?.length}}/50</text></view>
      <textarea class="field-textarea" :placeholder="cfg?.descPh || L?.descPh" placeholder-class="ph" maxlength="50" :value="desc" data-field="desc" @input="onInput" auto-height />
    </view>

    <view v-if="cfg?.hasImages !== false" class="field">
      <view class="field-label">{{L?.imagesLabel}}</view>
      <view class="img-row">
        <view v-for="(item, index) in images" :key="item" class="img-box">
          <image class="img" :src="item" mode="aspectFill" />
          <view class="img-del" :data-index="index" @tap.stop="onRemoveImage">✕</view>
        </view>
        <view v-if="images?.length < 3" class="img-add" @tap="onChooseImages">＋</view>
      </view>
    </view>

    <!-- 路线（出行信息/帮取/帮送） -->
    <template v-if="cfg?.hasRoute">
      <view class="field">
        <view class="field-label">{{cfg?.fromLabel}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="cfg?.fromLabel" placeholder-class="ph" maxlength="200" :value="from" data-field="from" @input="onInput" />
      </view>
      <view class="field">
        <view class="field-label">{{cfg?.toLabel}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="cfg?.toLabel" placeholder-class="ph" maxlength="200" :value="to" data-field="to" @input="onInput" />
      </view>
      <!-- 物品 + 重量（帮取/帮送必传） -->
      <view v-if="cfg?.itemRequired" class="field">
        <view class="field-label">{{L?.itemLabel}} <text class="req">*</text></view>
        <input class="field-input" :placeholder="L?.itemPh" placeholder-class="ph" maxlength="200" :value="extraValues?.item" data-key="item" @input="onExtraInput" />
      </view>
      <view v-if="cfg?.itemRequired" class="field">
        <view class="field-label">{{L?.weightLabel}} <text class="req">*</text></view>
        <input class="field-input" type="digit" data-num="d" :placeholder="L?.weightPh" placeholder-class="ph" maxlength="10" :value="extraValues?.weight" data-key="weight" @input="onExtraInput" />
      </view>
      <view v-if="cfg?.itemRequired" class="field">
        <view class="field-label">{{L?.secretLabel}}</view>
        <input class="field-input" :placeholder="L?.secretPh" placeholder-class="ph" maxlength="100" :value="secret" data-field="secret" @input="onInput" />
        <view class="field-hint">🔒 {{L?.secretHint}}</view>
      </view>
    </template>

    <view v-if="['hangout', 'carpool'].includes(category)" class="field">
      <view class="field-label">{{L?.placeLabel}}</view>
      <input class="field-input" :placeholder="L?.placePh" placeholder-class="ph" maxlength="100" :value="secret" data-field="secret" @input="onInput" />
      <view class="field-hint">🔒 {{L?.placeHint}}</view>
    </view>

    <!-- 期望时间（日期 + 时间双下拉） -->
    <view v-if="cfg?.hasDeadline" class="field">
      <view class="field-label">{{cfg?.deadlineLabel || L?.deadlineFallback}} <text v-if="cfg?.deadlineRequired" class="req">*</text></view>
      <view class="deadline-row">
        <picker mode="date" :value="deadlineDate" @change="onDateChange">
          <view :class="`deadline-box ${deadlineDate ? '' : 'deadline-ph'}`">{{deadlineDate || L?.selectDate}}</view>
        </picker>
        <picker mode="time" :value="deadlineTime" @change="onTimeChange">
          <view :class="`deadline-box ${deadlineTime ? '' : 'deadline-ph'}`">{{deadlineTime || L?.selectTime}}</view>
        </picker>
      </view>
    </view>

    <!-- 任务下架时间（帮取/帮送必传，最后一个字段）：期望时间 + N 小时 -->
    <view v-if="cfg?.autoDelistRequired" class="field">
      <view class="field-label">{{L?.delistLabel}} <text class="req">*</text></view>
      <picker mode="selector" :range="DELIST_LABELS" :value="delistHoursIndex < 0 ? 0 : delistHoursIndex" @change="onDelistHoursChange">
        <view class="field-picker">{{DELIST_LABELS?.[delistHoursIndex < 0 ? 0 : delistHoursIndex]}}</view>
      </picker>
      <view class="delist-hint">{{L?.delistHint}}</view>
    </view>

    <!-- 报酬（帮取/帮送） -->
    <view v-if="cfg?.hasReward" class="field">
      <view class="field-label">{{L?.rewardLabel}}</view>
      <view class="reward-row">
        <view class="reward-amount">
          <text class="reward-unit">{{ CUR }}</text>
          <input class="field-input" type="number" data-num="d" :placeholder="L?.amount" placeholder-class="ph" :value="rewardAmount" data-field="rewardAmount" @input="onInput" />
        </view>
        <input class="field-input reward-text" :placeholder="rewardAmount ? L?.rewardPhEmpty : L?.rewardPhOptional" placeholder-class="ph" placeholder-style="font-size: 22rpx" maxlength="200" :value="rewardText" data-field="rewardText" @input="onInput" />
      </view>
    </view>

  </view>

  <button class="submit-btn" @tap="onSubmit" :disabled="submitting">
    {{submitting ? (editMode ? L?.saving : L?.publishing) : (editMode ? L?.save : L?.publish)}}
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
import __m1_order_meta from '../../utils/order-meta.js';
import __m2_i18n from '../../utils/i18n.js';
import cloud from '@/utils/cloud.js';
import { chooseMedia } from '@/utils/platform.js';
import { localCurrency } from '@/utils/school-data.js';
// pages/order/publish —— 发布任务（8 类任务通用：按分类动态渲染表单）
// 类型选项的 id 为存库中文枚举,label 为本地化显示;写库用 id,展示用 label/extraDisplay
const app = __m0_app_state;
const { funcMeta, taskCategory } = __m1_order_meta;
const { t, tv, cloudMsg } = __m2_i18n;

// 任务下架时间：期望时间后的可选小时数（下拉形式）
const DELIST_HOURS = [4, 8, 12, 24];

// 类型选项等文案按当前语言构建（onLoad 时注入 data）
const buildPublishMeta = () => ({
  TASK_TYPES: [
    { label: t('op.taskTypePickup'), id: 'pickup' },
    { label: t('op.taskTypeDelivery'), id: 'delivery' },
  ],
  DELIST_LABELS: DELIST_HOURS.map((h) => t('op.delistHours', { h })),
  GROUPBUY_TYPES: [
    { label: t('op.gbTypeSplit'), id: '拆单' },
    { label: t('op.gbTypeJoin'), id: '凑单' },
  ],
  HOUSING_TYPES: [
    { label: t('op.rentSeek'), id: '求租' },
    { label: t('op.rentTransfer'), id: '转租' },
    { label: t('op.rentOut'), id: '出租' },
  ],
  HOUSING_HINTS: [t('op.rentSeekHint'), t('op.rentTransferHint'), t('op.rentOutHint')],
  PARTTIME_TYPES: [
    { label: t('op.ptSeek'), id: '找兼职' },
    { label: t('op.ptRecruit'), id: '招兼职' },
  ],
  PARTTIME_HINTS: [t('op.ptSeekHint'), t('op.ptRecruitHint')],
  HOMECOOK_TYPES: [
    { label: t('op.cookCook'), id: '做菜' },
    { label: t('op.cookOrder'), id: '点菜' },
  ],
  HOMECOOK_HINTS: [t('op.cookCookHint'), t('op.cookOrderHint')],
});

export default definePage({
  data: {
    category: 'pickup',
    func: null,
    cfg: null,        // 分类配置（hasRoute/hasDeadline/hasReward/extras）
    publishType: 'pickup', // 帮取帮送的细分类型
    TASK_TYPES: [],
    taskTypeIndex: 0,
    GROUPBUY_TYPES: [],
    gbTypeIndex: 0, // 拆单凑单类型（默认拆单）
    HOUSING_TYPES: [],
    housingTypeIndex: 0, // 租房类型（默认求租）
    housingHint: '',
    PARTTIME_TYPES: [],
    parttimeTypeIndex: 0, // 兼职类型（默认找兼职）
    parttimeHint: '',
    HOMECOOK_TYPES: [],
    homecookTypeIndex: 0, // 私厨点菜类型（默认做菜）
    homecookHint: '',
    title: '',
    desc: '',
    images: [],       // 云存储 fileID
    from: '',
    to: '',
    deadlineDate: '',
    deadlineTime: '',
    DELIST_LABELS: [],
    delistHoursIndex: 0, // 默认「期望时间后 4 小时」
    rewardAmount: '', // 仅 pickup/delivery/carpool 显示
    rewardText: '',
    secret: '',
    extraValues: {},  // 分类专属字段 {key: value}（picker 存中文枚举）
    extraDisplay: {}, // picker 字段的显示标签 {key: label}
    extraIndexes: {}, // picker 类字段选中下标 {key: idx}
    extraDates: {},   // datetime 类字段：日期部分 {key: 'YYYY-MM-DD'}
    extraTimes: {},   // datetime 类字段：时间部分 {key: 'HH:mm'}
    submitting: false,
    showTop: false,
    privacyVisible: false,
    clientOrderId: '', // 幂等建单 id（网络失败自动重试不重复）
    editMode: false,   // 编辑模式
    editId: '',
    CUR: localCurrency(), // 金额符号:中文 ¥ / 其他语言 ₩
    L: {},
  },

  // 编辑模式：拉取订单回填表单
  loadOrderForEdit(orderId) {
    uni.showLoading({ title: t('common.loading') });
    cloud
      .callFunction({ name: 'krstuast', data: { action: 'getOrderDetail', orderId } })
      .then((res) => {
        uni.hideLoading();
        const r = res.result || {};
        if (!r.success) return uni.showToast({ title: cloudMsg(r.message), icon: 'none' });
        const o = r.order;
        const cfg = this.data.cfg;
        const patch = {
          title: o.title || '',
          desc: o.desc || '',
          images: o.images || [],
          from: o.from || '',
          to: o.to || '',
          rewardAmount: o.rewardAmount ? String(o.rewardAmount) : '',
          rewardText: o.rewardText || '',
          secret: o.secret || '',
        };
        if (o.deadline) {
          const parts = o.deadline.split(' ');
          patch.deadlineDate = parts[0] || '';
          patch.deadlineTime = parts[1] || '';
        }
        // 下架小时数：从 autoDelistAt 与 deadline 的差值反推
        if (o.autoDelistAt && o.deadline) {
          const diff = (new Date(o.autoDelistAt.replace(/-/g, '/')).getTime() - new Date(o.deadline.replace(/-/g, '/')).getTime()) / 3600000;
          const idx = DELIST_HOURS.indexOf(Math.round(diff));
          patch.delistHoursIndex = idx >= 0 ? idx : 0;
        }
        // payload 回填
        const extraValues = {};
        const extraDisplay = {};
        const extraIndexes = {};
        const extraDates = {};
        const extraTimes = {};
        (cfg.extras || []).forEach((f) => {
          const v = o.payload ? o.payload[f.key] : '';
          extraValues[f.key] = v !== undefined && v !== null ? v : '';
          if (f.type === 'picker') {
            const i = (f.options || []).findIndex((x) => x.value === String(v));
            extraIndexes[f.key] = i >= 0 ? i : 0;
            extraDisplay[f.key] = i >= 0 ? f.options[i].label : '';
          }
          if (f.type === 'datetime' && v) {
            const ps = String(v).split(' ');
            extraDates[f.key] = ps[0] || '';
            extraTimes[f.key] = ps[1] || '';
          }
          if (f.type === 'date' && v) {
            extraDates[f.key] = String(v).slice(0, 10);
          }
        });
        // 细分类型
        if (this.data.category === 'pickup') {
          const ti = this.data.TASK_TYPES.findIndex((x) => x.id === o.functionId);
          if (ti >= 0) patch.taskTypeIndex = ti;
          patch.publishType = o.functionId;
        }
        if (this.data.category === 'groupbuy') {
          const gi = this.data.GROUPBUY_TYPES.findIndex((x) => x.id === (o.payload && o.payload.gbType));
          if (gi >= 0) patch.gbTypeIndex = gi;
          extraValues.gbType = (o.payload && o.payload.gbType) || '拆单';
        }
        if (this.data.category === 'housing') {
          const hi = this.data.HOUSING_TYPES.findIndex((x) => x.id === String(o.payload && o.payload.rentType));
          if (hi >= 0) {
            patch.housingTypeIndex = hi;
            patch.housingHint = this.data.HOUSING_HINTS[hi];
          } else {
            extraValues.rentType = '求租'; // 老单无此字段，默认求租
          }
        }
        if (this.data.category === 'parttime') {
          const pi = this.data.PARTTIME_TYPES.findIndex((x) => x.id === String(o.payload && o.payload.parttimeType));
          if (pi >= 0) {
            patch.parttimeTypeIndex = pi;
            patch.parttimeHint = this.data.PARTTIME_HINTS[pi];
          } else {
            extraValues.parttimeType = '找兼职'; // 老单无此字段，默认找兼职
          }
        }
        if (this.data.category === 'homecook') {
          const ci = this.data.HOMECOOK_TYPES.findIndex((x) => x.id === String(o.payload && o.payload.cookType));
          if (ci >= 0) {
            patch.homecookTypeIndex = ci;
            patch.homecookHint = this.data.HOMECOOK_HINTS[ci];
          } else {
            extraValues.cookType = '做菜'; // 老单无此字段，默认做菜
          }
        }
        patch.extraValues = extraValues;
        patch.extraDisplay = extraDisplay;
        patch.extraIndexes = extraIndexes;
        patch.extraDates = extraDates;
        patch.extraTimes = extraTimes;
        this.setData(patch);
      })
      .catch(() => {
        uni.hideLoading();
        uni.showToast({ title: t('common.networkError'), icon: 'none' });
      });
  },

  onLoad(options) {
    const category = options.category || 'pickup';
    const editId = options.edit || '';
    this.setData({ editMode: !!editId, editId });
    const meta = buildPublishMeta();
    // 选项 label 数组(picker range 用) + 表单静态文案
    const cfg = taskCategory(category);
    (cfg.extras || []).forEach((f) => {
      if (f.type === 'picker') f.optionLabels = f.options.map((o) => o.label);
      if (f.type === 'payRow' || f.type === 'priceRow') f.unitOptionLabels = f.unitOptions.map((o) => o.label);
    });
    const L = {
      typeLabel: t('op.typeLabel'),
      titleLabel: t('op.titleLabel'),
      titlePh: t('op.titlePh'),
      descLabel: t('op.descLabel'),
      descPh: t('op.descPh'),
      imagesLabel: t('op.imagesLabel'),
      itemLabel: t('op.itemLabel'),
      itemPh: t('op.itemPh'),
      weightLabel: t('op.weightLabel'),
      weightPh: t('op.weightPh'),
      placeLabel: t('op.placeLabel'), placePh: t('op.placePh'), placeHint: t('op.placeHint'),
      secretLabel: t('op.secretLabel'), secretPh: t('op.secretPh'), secretHint: t('op.secretHint'),
      deadlineFallback: t('op.deadlineFallback'),
      delistLabel: t('op.delistLabel'),
      delistHint: t('op.delistHint'),
      rewardLabel: t('op.rewardLabel'),
      amount: t('op.amount'),
      rewardPhEmpty: t('op.rewardPhEmpty'),
      rewardPhOptional: t('op.rewardPhOptional'),
      perWord: t('op.perWord'),
      selectPlaceholder: t('common.selectPlaceholder'),
      selectDate: t('common.selectDate'),
      selectTime: t('common.selectTime'),
      saving: t('common.saving'),
      publishing: t('common.publishing'),
      save: t('common.save'),
      publish: t('common.publish'),
      gbHintSplit: t('op.gbHintSplit'),
      gbHintJoin: t('op.gbHintJoin'),
    };
    this.setData({
      ...meta,
      housingHint: meta.HOUSING_HINTS[0],
      parttimeHint: meta.PARTTIME_HINTS[0],
      homecookHint: meta.HOMECOOK_HINTS[0],
      L,
    });
    if (editId) {
      this.loadOrderForEdit(editId);
    }
    // 幂等 id：同一表单的多次提交（含网络失败重试）只建一单
    this.setData({ clientOrderId: 'ord-' + Date.now() + '-' + Math.floor(Math.random() * 100000) });
    const extraValues = {};
    const extraDisplay = {};
    const extraIndexes = {};
    const extraDates = {};
    const extraTimes = {};
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
    const defaultTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 当前时间 + 2 小时
    (cfg.extras || []).forEach((f) => {
      extraValues[f.key] = '';
      extraIndexes[f.key] = f.type === 'picker' ? 0 : -1;
      if (f.type === 'picker') extraDisplay[f.key] = f.options[0].label;
      if (f.type === 'datetime') {
        // 出发时间默认 = 当前时间 + 2 小时
        extraDates[f.key] = `${defaultTime.getFullYear()}-${pad2(defaultTime.getMonth() + 1)}-${pad2(defaultTime.getDate())}`;
        extraTimes[f.key] = `${pad2(defaultTime.getHours())}:${pad2(defaultTime.getMinutes())}`;
        extraValues[f.key] = `${extraDates[f.key]} ${extraTimes[f.key]}`;
      }
      if (f.type === 'date') {
        // 日期默认当天（不带时间，如拼好饭）
        const today = new Date();
        extraDates[f.key] = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
        extraValues[f.key] = extraDates[f.key];
      }
    });
    // 胶囊类型默认值：必须在 extras 初始化之后设置，否则会被重置为空
    extraValues.gbType = '拆单'; // 拆单凑单默认拆单
    if (category === 'housing') extraValues.rentType = '求租'; // 租房默认求租
    if (category === 'parttime') extraValues.parttimeType = '找兼职'; // 兼职默认找兼职
    if (category === 'companion') extraValues.priceN = '1'; // 陪玩价格数量默认 1（每 1 次/小时）
    if (category === 'homecook') extraValues.cookType = '做菜'; // 私厨点菜默认做菜
    // 期望时间默认 = 当前时间 + 2 小时
    let deadlineDate = '';
    let deadlineTime = '';
    if (cfg.hasDeadline) {
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
      deadlineDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      deadlineTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    this.setData({
      category,
      func: funcMeta(category),
      cfg,
      extraValues,
      extraDisplay,
      extraIndexes,
      extraDates,
      extraTimes,
      deadlineDate,
      deadlineTime,
    });
    uni.setNavigationBarTitle({ title: t('nav.orderPublish', { name: funcMeta(category).name }) });
  },

  // datetime 类字段：日期 + 时间 双下拉，合并成 'YYYY-MM-DD HH:mm'
  onExtraDateChange(e) {
    const { key } = e.currentTarget.dataset;
    const date = e.detail.value;
    const time = this.data.extraTimes[key] || '';
    this.setData({
      ['extraDates.' + key]: date,
      ['extraValues.' + key]: date + (time ? ' ' + time : ''),
    });
  },
  onExtraTimeChange(e) {
    const { key } = e.currentTarget.dataset;
    const time = e.detail.value;
    const date = this.data.extraDates[key] || '';
    this.setData({
      ['extraTimes.' + key]: time,
      ['extraValues.' + key]: date ? date + ' ' + time : '',
    });
  },

  onInput(e) {
    const { field, num } = e.currentTarget.dataset;
    const v = num ? this.cleanNum(e.detail.value, num) : e.detail.value;
    this.setData({ [field]: v });
    return v;
  },

  onTaskTypeChange(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ taskTypeIndex: i, publishType: this.data.TASK_TYPES[i].id });
  },

  onGbTypeChange(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ gbTypeIndex: i, 'extraValues.gbType': this.data.GROUPBUY_TYPES[i].id });
  },

  onHousingTypeChange(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({
      housingTypeIndex: i,
      'extraValues.rentType': this.data.HOUSING_TYPES[i].id,
      housingHint: this.data.HOUSING_HINTS[i],
    });
  },

  onParttimeTypeChange(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({
      parttimeTypeIndex: i,
      'extraValues.parttimeType': this.data.PARTTIME_TYPES[i].id,
      parttimeHint: this.data.PARTTIME_HINTS[i],
    });
  },

  onHomecookTypeChange(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({
      homecookTypeIndex: i,
      'extraValues.cookType': this.data.HOMECOOK_TYPES[i].id,
      homecookHint: this.data.HOMECOOK_HINTS[i],
    });
  },

  // 合并行（payRow）的单位下拉：unitKey 指向 hidden picker 字段
  onUnitChange(e) {
    const { unitKey } = e.currentTarget.dataset;
    const f = (this.data.cfg.extras || []).find((x) => x.key === unitKey);
    if (!f) return;
    const i = Number(e.detail.value);
    const o = f.options[i];
    this.setData({
      ['extraIndexes.' + unitKey]: i,
      ['extraValues.' + unitKey]: o.value,
      ['extraDisplay.' + unitKey]: o.label,
    });
  },

  // 数字框只保留数字和一个小数点(挡住 - e + 等),小数最多 2 位,长度 ≤ 9
  cleanNum(v, mode) {
    let s = String(v || '').replace(mode === 'i' ? /[^0-9]/g : /[^0-9.]/g, '');
    const i = s.indexOf('.');
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 2);
    if (s.startsWith('.')) s = '0' + s;
    s = s.replace(/^0+(?=\d)/, '');
    return s.slice(0, 9);
  },

  onExtraInput(e) {
    const { key, num } = e.currentTarget.dataset;
    const v = num ? this.cleanNum(e.detail.value, num) : e.detail.value;
    this.setData({ ['extraValues.' + key]: v });
    return v;
  },

  onExtraPickerChange(e) {
    const { key, index } = e.currentTarget.dataset;
    const f = this.data.cfg.extras[index];
    const i = Number(e.detail.value);
    const o = f.options[i];
    this.setData({
      ['extraIndexes.' + key]: i,
      ['extraValues.' + key]: o.value,
      ['extraDisplay.' + key]: o.label,
    });
  },

  onDateChange(e) {
    this.setData({ deadlineDate: e.detail.value });
  },
  onTimeChange(e) {
    this.setData({ deadlineTime: e.detail.value });
  },
  onDelistHoursChange(e) {
    this.setData({ delistHoursIndex: Number(e.detail.value) });
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
            cloudPath: `orders/${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}.jpg`,
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
    if (!d.cfg.noTitle && !d.title.trim()) return this.toast(t('op.titleRequired'));
    if (d.cfg.hasRoute) {
      if (!d.from.trim()) return this.toast(t('common.pleaseFill', { field: d.cfg.fromLabel }));
      if (!d.to.trim()) return this.toast(t('common.pleaseFill', { field: d.cfg.toLabel }));
    }
    if (d.cfg.deadlineRequired && (!d.deadlineDate || !d.deadlineTime)) return this.toast(t('op.pleaseDeadline'));
    if (d.cfg.autoDelistRequired && d.delistHoursIndex < 0) return this.toast(t('op.pleaseDelist'));
    if (d.deadlineDate && d.deadlineTime && new Date(`${d.deadlineDate} ${d.deadlineTime}`.replace(/-/g, '/')).getTime() < Date.now()) {
      return this.toast(t('op.deadlinePast'));
    }
    // 分类必填字段（如出行信息出发时间）；按胶囊类型隐藏的字段不参与校验（showWhen 比较存值,勿改）
    const missing = (d.cfg.extras || []).find((f) => {
      if (f.showWhen && d.extraValues[f.showWhen.key] !== f.showWhen.value) return false;
      return f.required && !(d.extraValues[f.key] || '').trim();
    });
    if (missing) return this.toast(t('common.pleaseSelect', { field: missing.label }));
    if (d.cfg.itemRequired) {
      if (!(d.extraValues.item || '').trim()) return this.toast(t('op.pleaseItem'));
      const w = Number(d.extraValues.weight);
      if (!(d.extraValues.weight || '').trim() || isNaN(w) || w <= 0 || w > 100) return this.toast(t('op.pleaseWeight'));
    }
    if (d.rewardAmount && isNaN(Number(d.rewardAmount))) return this.toast(t('op.rewardInvalid'));

    const school = app.readSchool();
    const deadline = d.deadlineDate && d.deadlineTime ? `${d.deadlineDate} ${d.deadlineTime}` : '';
    // 下架时间 = 期望时间（或出发时间）+ 所选小时数
    let autoDelistAt = '';
    const delistBase = deadline || (d.cfg.autoDelistRequired ? (d.extraValues.time || '') : '');
    if (d.cfg.autoDelistRequired && delistBase) {
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const t = new Date(new Date(delistBase.replace(/-/g, '/')).getTime() + DELIST_HOURS[d.delistHoursIndex] * 3600 * 1000);
      autoDelistAt = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
      if (new Date(autoDelistAt.replace(/-/g, '/')).getTime() < Date.now()) {
        return this.toast(t('op.delistPast'));
      }
    }

    this.setData({ submitting: true });
    // 帮取帮送：按用户选的细分类型入库（pickup / delivery）
    const functionId = d.category === 'pickup' ? d.publishType : d.category;
    // 攒局：无标题字段，自动生成「类型 · 人数」（标题视为用户语言书写的内容,用本地化标签）
    let title = d.title;
    if (d.category === 'hangout') {
      const fallbackName = (this.data.func && this.data.func.name) || 'hangout';
      const label = (d.extraValues.customType || tv('hangoutType', d.extraValues.type) || fallbackName).trim();
      title = (d.extraValues.people || '').trim()
        ? t('op.hangoutTitle', { label, people: d.extraValues.people })
        : label;
    }
    // 闲置：无标题字段，自动生成「物品名称 · ¥价格」
    if (d.category === 'secondhand') {
      const name = (d.extraValues.productName || '').trim();
      const price = (d.extraValues.price || '').trim();
      title = name;
    }
    this.submitOrder({
      functionId,
      title,
      desc: d.desc,
      images: d.images,
      from: d.from,
      to: d.to,
      deadline,
      autoDelistAt,
      rewardAmount: d.rewardAmount,
      rewardText: d.rewardText,
      payload: d.extraValues,
      secret: d.secret || '',
      schoolId: school ? school.id : '',
      clientOrderId: d.clientOrderId,
    });
  },

  // 提交建单；网络失败自动重试一次（云函数按 clientOrderId 幂等，不会重复建单）
  submitOrder(payload, isRetry) {
    const data = this.data.editMode
      ? { action: 'updateOrder', orderId: this.data.editId, payload }
      : { action: 'createOrder', payload };
    cloud
      .callFunction({ name: 'krstuast', data })
      .then((res) => {
        this.setData({ submitting: false });
        const r = res.result || {};
        if (!r.success) return this.toast(cloudMsg(r.message));
        uni.showToast({ title: this.data.editMode ? t('common.savedOk') : t('common.publishedOk'), icon: 'none' });
        if (this.data.editMode) {
          // 编辑模式：返回原详情页（其 onShow 会重新拉取最新数据），返回一次即可回到卡片页
          uni.navigateBack({
            fail: () => uni.redirectTo({ url: '/pages/order/detail?id=' + this.data.editId }),
          });
        } else {
          // 发布模式：用详情页替换发布页，返回一次直接回列表
          uni.redirectTo({ url: '/pages/order/detail?id=' + r.orderId });
        }
      })
      .catch((e) => {
        console.error('createOrder', e);
        if (!isRetry) {
          // 网络类失败重试一次（幂等安全）
          this.submitOrder(payload, true);
          return;
        }
        this.setData({ submitting: false });
        this.toast(t('common.networkRetry'));
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
/* pages/order/publish 发布任务 */
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
.field-picker {
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
}
.field-picker.ph {
  color: #8a8494; /* 未选择时的占位文字用灰色（覆盖 .field-picker 的深色） */
}
.field-textarea {
  width: 100%;
  box-sizing: border-box;
  font-size: 28rpx;
  color: #1f1d24;
  background: #f6f5f7;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  min-height: 140rpx;
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
.delist-hint {
  font-size: 22rpx;
  color: #b07f2e;
  margin-top: 14rpx;
}
.extra-hint {
  font-size: 20rpx;
  color: #8a8494;
  margin-left: 12rpx;
}
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
  width: 200rpx;
}
.reward-text {
  flex: 1;
}
.pay-unit {
  flex: 1;
}
.price-row .reward-amount .field-input {
  width: 150rpx;
}
.per-word {
  margin: 0 10rpx;
  color: #6e6878;
  font-size: 26rpx;
  flex-shrink: 0;
}
.price-n {
  width: 140rpx;
  flex-shrink: 0;
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

.field-hint { margin-top: 10rpx; font-size: 22rpx; color: #9a6a00; }
</style>
