const React = require("react");
const {Box,Text,useInput,Newline} = require("ink");
const WizardContext = require("../WizardContext");
const {useContext,useState,useEffect} = require("react");
const {default: SelectInput} = require("ink-select-input");
const chalk = require("chalk");

const Indicator = ({label: selectedLabel,value: selectedValue}) => {
	const {
		config: {
			rpc: {
				value,
				state: {items},
			},
		},
	} = useContext(WizardContext);

	const isSelected = items.find(
		(item) => item.value === selectedValue
	).isSelected;

	return (
		<Text>
			{chalk[
				value?.includes(selectedValue)
					? "greenBright"
					: isSelected
						? "white"
						: "gray"
			](`${isSelected ? "⦿" : "○"} ${selectedLabel}`)}
		</Text>
	);
};

function Rpc() {
	const {
		config: {
			rpc: {state},
		},
		configSetValue,
		configSwitchState,
	} = useContext(WizardContext);

	const items = state?.items || [];

	// Auto-select environment variable RPC by default
	useEffect(() => {
		// Get RPCs from env
		const defaultRpc = process.env.DEFAULT_RPC;
		const altRpcList = process.env.ALT_RPC_LIST ? process.env.ALT_RPC_LIST.split(',') : [];

		// Create list of RPCs to select
		const rpcList = [defaultRpc,...altRpcList].filter(Boolean);

		// Auto-select the RPCs if available
		if(rpcList.length > 0) {
			configSetValue("rpc",rpcList);
		}
	},[]);

	const handleSelect = () => {
		const valueToSet = items
			.filter((item) => item.isSelected)
			.map((item) => item.value);
		configSetValue("rpc",valueToSet);
	};

	const [highlightedItem,setHighlightedItem] = useState();

	useInput((input) => {
		if(input === " " && highlightedItem) {
			configSwitchState("rpc",highlightedItem.value);
		}
	});

	const handleHighlight = (item) => setHighlightedItem(item);
	return (
		<Box flexDirection="column">
			<Text>Please select at least one RPC.</Text>
			<Text>
				If You choose more, You can switch between them while the bot is
				running.
			</Text>
			<Newline />
			<SelectInput
				items={items}
				onHighlight={handleHighlight}
				onSelect={handleSelect}
				itemComponent={Indicator}
			/>
		</Box>
	);
}
module.exports = Rpc;
