import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getHistory } from '../api/client';
import type { HistoryEntry, LineDetail } from '../types';

const { Text } = Typography;

interface Props {
  memberId: string;
  refreshKey: number;
}

const PAGE_SIZE = 20;

const entryTypeColors: Record<string, string> = {
  EARN: 'green',
  BURN: 'orange',
  REFUND_CLAWBACK: 'red',
  ADJUSTMENT: 'blue',
  EXPIRY: 'volcano',
};

const columns: ColumnsType<HistoryEntry> = [
  {
    title: 'Date',
    dataIndex: 'createdAt',
    key: 'date',
    width: 160,
    render: (val: string) => new Date(val).toLocaleString('th-TH'),
  },
  {
    title: 'Type',
    dataIndex: 'entryType',
    key: 'type',
    width: 140,
    render: (val: string) => (
      <Tag color={entryTypeColors[val] || 'default'}>{val}</Tag>
    ),
  },
  {
    title: 'Points',
    dataIndex: 'points',
    key: 'points',
    width: 100,
    align: 'right',
    render: (val: number) => (
      <Text type={val >= 0 ? 'success' : 'danger'} strong>
        {val >= 0 ? `+${val}` : val}
      </Text>
    ),
  },
  {
    title: 'Description',
    dataIndex: 'description',
    key: 'description',
    ellipsis: true,
  },
];

const lineColumns: ColumnsType<LineDetail> = [
  { title: 'Line', dataIndex: 'lineNo', key: 'lineNo', width: 60 },
  { title: 'Category', dataIndex: 'category', key: 'category', width: 120 },
  {
    title: 'Amount (THB)',
    dataIndex: 'amountTHB',
    key: 'amountTHB',
    width: 120,
    align: 'right',
    render: (val: number) => val?.toLocaleString('th-TH'),
  },
  {
    title: 'Campaign',
    dataIndex: 'winningCampaign',
    key: 'campaign',
    width: 140,
    render: (val: string) => val || 'BASE',
  },
  {
    title: 'Multiplier',
    dataIndex: 'multiplier',
    key: 'multiplier',
    width: 100,
    align: 'right',
    render: (val: number) => `x${val}`,
  },
];

const TransactionHistory: React.FC<Props> = ({ memberId, refreshKey }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [memberId, refreshKey]);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const offset = (page - 1) * PAGE_SIZE;
        const data = await getHistory(memberId, PAGE_SIZE, offset);
        setEntries(data.entries);
        setTotal(data.total);
      } catch {
        setEntries([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [memberId, page, refreshKey]);

  return (
    <Card title="Transaction History" style={{ marginBottom: 24 }}>
      <Table<HistoryEntry>
        columns={columns}
        dataSource={entries}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          onChange: (p) => setPage(p),
          showTotal: (t) => `Total ${t} entries`,
        }}
        expandable={{
          expandedRowRender: (record) =>
            record.lineDetails && record.lineDetails.length > 0 ? (
              <Table<LineDetail>
                columns={lineColumns}
                dataSource={record.lineDetails}
                rowKey="lineNo"
                pagination={false}
                size="small"
              />
            ) : (
              <Text type="secondary">No line details available</Text>
            ),
          rowExpandable: (record) => record.entryType === 'EARN',
        }}
        size="middle"
      />
    </Card>
  );
};

export default TransactionHistory;
