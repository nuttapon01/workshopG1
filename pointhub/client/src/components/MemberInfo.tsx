import React from 'react';
import { Card, Tag, Statistic, Row, Col, Descriptions } from 'antd';
import type { MemberData, BalanceData } from '../types';

interface Props {
  member: MemberData;
  balance: BalanceData;
}

const tierColors: Record<string, string> = {
  SILVER: 'default',
  GOLD: 'gold',
  PLATINUM: 'purple',
};

const MemberInfo: React.FC<Props> = ({ member, balance }) => {
  return (
    <Card title="Member Information" style={{ marginBottom: 24 }}>
      <Row gutter={24}>
        <Col span={8}>
          <Statistic title="Point Balance" value={balance.balance} suffix="pts" />
        </Col>
        <Col span={8}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Member ID">{member.memberId}</Descriptions.Item>
            <Descriptions.Item label="Tier">
              <Tag color={tierColors[member.tier] || 'default'}>{member.tier}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Joined">
              {new Date(member.joinedAt).toLocaleDateString('th-TH')}
            </Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>
    </Card>
  );
};

export default MemberInfo;
