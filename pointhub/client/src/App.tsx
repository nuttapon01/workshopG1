import React, { useState } from 'react';
import { ConfigProvider, Layout, Typography } from 'antd';
import MemberLookup from './components/MemberLookup';
import MemberInfo from './components/MemberInfo';
import TransactionHistory from './components/TransactionHistory';
import AdjustmentForm from './components/AdjustmentForm';
import type { MemberData, BalanceData } from './types';

const { Header, Content } = Layout;
const { Title } = Typography;

const App: React.FC = () => {
  const [member, setMember] = useState<MemberData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleMemberFound = (memberData: MemberData, balanceData: BalanceData) => {
    setMember(memberData);
    setBalance(balanceData);
    setRefreshKey((k) => k + 1);
  };

  const handleAdjustmentSuccess = (newBalance: number) => {
    setBalance((prev) => (prev ? { ...prev, balance: newBalance } : prev));
    setRefreshKey((k) => k + 1);
  };

  return (
    <ConfigProvider>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={3} style={{ color: '#fff', margin: 0 }}>
            PointHub - Customer Service
          </Title>
        </Header>
        <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <MemberLookup onMemberFound={handleMemberFound} />

          {member && balance && (
            <>
              <MemberInfo member={member} balance={balance} />
              <AdjustmentForm
                memberId={member.memberId}
                onSuccess={handleAdjustmentSuccess}
              />
              <TransactionHistory memberId={member.memberId} refreshKey={refreshKey} />
            </>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
