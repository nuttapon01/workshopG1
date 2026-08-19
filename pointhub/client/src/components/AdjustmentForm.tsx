import React, { useState } from 'react';
import { Card, Form, InputNumber, Select, Input, Button, message, Space } from 'antd';
import { postAdjustment } from '../api/client';
import type { ReasonCode } from '../types';

const { TextArea } = Input;

interface Props {
  memberId: string;
  onSuccess: (newBalance: number) => void;
}

const reasonCodeOptions: { value: ReasonCode; label: string }[] = [
  { value: 'GOODWILL', label: 'Goodwill' },
  { value: 'SYSTEM_ERROR', label: 'System Error Correction' },
  { value: 'FRAUD_DEDUCT', label: 'Fraud Deduction' },
  { value: 'EVENT_BONUS', label: 'Event Bonus' },
];

interface FormValues {
  points: number;
  reasonCode: ReasonCode;
  description?: string;
}

const AdjustmentForm: React.FC<Props> = ({ memberId, onSuccess }) => {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const result = await postAdjustment(
        memberId,
        values.points,
        values.reasonCode,
        values.description
      );
      message.success(`Adjustment posted. New balance: ${result.newBalance} pts`);
      onSuccess(result.newBalance);
      form.resetFields();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to post adjustment';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Manual Adjustment" style={{ marginBottom: 24 }}>
      <Form<FormValues>
        form={form}
        layout="inline"
        onFinish={handleSubmit}
        style={{ flexWrap: 'wrap', gap: 8 }}
      >
        <Form.Item
          name="points"
          label="Points"
          rules={[
            { required: true, message: 'Enter points' },
            { type: 'number', message: 'Must be a number' },
            {
              validator: (_, value) =>
                value === 0
                  ? Promise.reject('Cannot be zero')
                  : Promise.resolve(),
            },
          ]}
        >
          <InputNumber
            placeholder="+100 or -50"
            style={{ width: 140 }}
          />
        </Form.Item>

        <Form.Item
          name="reasonCode"
          label="Reason"
          rules={[{ required: true, message: 'Select reason' }]}
        >
          <Select
            placeholder="Select reason"
            options={reasonCodeOptions}
            style={{ width: 200 }}
          />
        </Form.Item>

        <Form.Item name="description" label="Note">
          <TextArea
            placeholder="Optional description"
            rows={1}
            style={{ width: 240 }}
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              Submit Adjustment
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default AdjustmentForm;
