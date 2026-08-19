import React, { useState } from 'react';
import { Input, Card, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { getMember, getBalance } from '../api/client';
import type { MemberData, BalanceData } from '../types';

const { Search } = Input;

interface Props {
  onMemberFound: (member: MemberData, balance: BalanceData) => void;
}

const MemberLookup: React.FC<Props> = ({ onMemberFound }) => {
  const [loading, setLoading] = useState(false);

  const handleSearch = async (value: string) => {
    const memberId = value.trim();
    if (!memberId) {
      message.warning('Please enter a member ID');
      return;
    }

    setLoading(true);
    try {
      const [memberData, balanceData] = await Promise.all([
        getMember(memberId),
        getBalance(memberId),
      ]);
      onMemberFound(memberData, balanceData);
    } catch (err: any) {
      if (err.response?.status === 404) {
        message.error('Member not found');
      } else {
        message.error('Failed to look up member. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ marginBottom: 24 }}>
      <Search
        placeholder="Enter Member ID (e.g. M1001)"
        enterButton={<><SearchOutlined /> Search</>}
        size="large"
        loading={loading}
        onSearch={handleSearch}
        allowClear
      />
    </Card>
  );
};

export default MemberLookup;
