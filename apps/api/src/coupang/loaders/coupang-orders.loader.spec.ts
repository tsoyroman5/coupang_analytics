import { OrderSheet, stripOrderPii } from './coupang-orders.loader';

/** Shaped like the PO list example in the Coupang docs, including every PII field. */
const sheet: OrderSheet = {
  shipmentBoxId: '642538970006401429',
  orderId: 22000009546234,
  orderedAt: '2025-01-15T14:17:13.973885+09:00',
  paidAt: '2025-01-15T14:17:13.973885+09:00',
  status: 'FINAL_DELIVERY',
  orderer: { name: '신*희', email: '', safeNumber: '0502-1234-5678', ordererNumber: null },
  receiver: { name: '신*희', safeNumber: '0502-1234-5678', addr1: '경기 광명시', addr2: '107동701호', postCode: '423-747' },
  parcelPrintMessage: '문 앞',
  overseaShippingInfoDto: { personalCustomsClearanceCode: 'P123', ordererPhoneNumber: '010-0000-0000' },
  invoiceNumber: '340010913442',
  shippingPrice: { currencyCode: 'KRW', units: 2500, nanos: 0 },
  deliveryCompanyName: 'CJ 대한통운',
  orderItems: [
    {
      vendorItemId: 3242596358,
      sellerProductId: 80240831,
      shippingCount: 1,
      orderPrice: { currencyCode: 'KRW', units: 19900, nanos: 0 },
      etcInfoHeader: '각인 문구',
      etcInfoValue: '사랑해 민지',
      etcInfoValues: ['사랑해 민지'],
    },
  ],
};

describe('stripOrderPii', () => {
  const out = stripOrderPii(sheet);
  const text = JSON.stringify(out);

  it('drops every buyer-identifying field', () => {
    for (const key of ['orderer', 'receiver', 'parcelPrintMessage', 'overseaShippingInfoDto', 'invoiceNumber']) {
      expect(out).not.toHaveProperty(key);
    }
    expect(text).not.toContain('광명시');
    expect(text).not.toContain('0502-1234-5678');
  });

  it('drops buyer free text from order items', () => {
    const item = (out['orderItems'] as Record<string, unknown>[])[0];
    expect(item).not.toHaveProperty('etcInfoValue');
    expect(item).not.toHaveProperty('etcInfoValues');
    expect(text).not.toContain('민지');
  });

  it('keeps the fields analytics needs', () => {
    expect(out).toMatchObject({
      shipmentBoxId: '642538970006401429',
      status: 'FINAL_DELIVERY',
      shippingPrice: { units: 2500 },
      deliveryCompanyName: 'CJ 대한통운',
    });
    expect((out['orderItems'] as Record<string, unknown>[])[0]).toMatchObject({
      vendorItemId: 3242596358,
      orderPrice: { units: 19900 },
    });
  });

  it('does not mutate the input', () => {
    expect(sheet).toHaveProperty('receiver');
  });
});
